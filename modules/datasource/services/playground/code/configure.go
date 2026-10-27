package main

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	"github.com/codefly-dev/core/standards"
	codefly "github.com/codefly-dev/sdk-go"

	"playground/pkg/adapters"
	"playground/pkg/business"
	bucketapi "playground/pkg/clients/bucket"
	storagev0 "playground/pkg/clients/storage/codefly/storage/v0"
)

func init() {
	WithConfigure(configureService)
}

// gatewayTokenHeader is the metadata header an object-storage gateway
// authenticates a caller with.
const gatewayTokenHeader = "x-codefly-token"

// storageConfigurationGroup is the configuration group the object-storage
// agent publishes to the services that depend on it.
const storageConfigurationGroup = "object-storage"

// configureService dials the tenant store and the datasource, and reads the
// store's credential from the composition.
//
// This is the part a deployment does differently: there the host holds the
// credential a person entered and hands one over per call. Here the tenant
// store publishes its own, because it is a throwaway store that exists for
// the proof. Everything downstream of this function is identical either way.
func configureService(ctx context.Context, config *adapters.Configuration) (Clean, error) {
	tenant := codefly.For(ctx).Service("tenant")
	tenantInstance, err := tenant.API(standards.GRPC).ResolveNetworkInstance()
	if err != nil {
		return nil, fmt.Errorf("cannot resolve the tenant store: %w", err)
	}
	tenantToken, err := tenant.Secret(storageConfigurationGroup, "token")
	if err != nil {
		return nil, fmt.Errorf("cannot read the tenant store's token: %w", err)
	}
	store, err := tenantStore(tenant)
	if err != nil {
		return nil, err
	}
	tenantConnection, err := grpc.NewClient(tenantInstance.Address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithUnaryInterceptor(withToken(tenantToken)),
		grpc.WithStreamInterceptor(withTokenStream(tenantToken)),
	)
	if err != nil {
		return nil, fmt.Errorf("cannot dial the tenant store: %w", err)
	}

	datasourceInstance, err := codefly.For(ctx).Service("bucket").API(standards.GRPC).ResolveNetworkInstance()
	if err != nil {
		return nil, fmt.Errorf("cannot resolve the bucket datasource: %w", err)
	}
	datasourceConnection, err := grpc.NewClient(datasourceInstance.Address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("cannot dial the bucket datasource: %w", err)
	}

	config.Service = business.New(
		storagev0.NewObjectStorageClient(tenantConnection),
		bucketapi.NewBucketServiceClient(datasourceConnection),
		store,
	)
	return func() {
		_ = datasourceConnection.Close()
		_ = tenantConnection.Close()
	}, nil
}

// tenantStore reads where the tenant store is and what opens it. These three
// values exist only on a local run, and only because the tenant service
// declares the agent's `minio` endpoint: without it its MinIO stays private
// and there is nothing to bind.
func tenantStore(tenant interface {
	Configuration(group string, key string) (string, error)
	Secret(group string, key string) (string, error)
}) (business.Store, error) {
	endpoint, err := tenant.Configuration(storageConfigurationGroup, "minio_endpoint")
	if err != nil {
		return business.Store{}, fmt.Errorf("cannot read the tenant store's endpoint — does the tenant service declare a `minio` endpoint? %w", err)
	}
	accessKey, err := tenant.Configuration(storageConfigurationGroup, "minio_access_key")
	if err != nil {
		return business.Store{}, fmt.Errorf("cannot read the tenant store's access key: %w", err)
	}
	secret, err := tenant.Secret(storageConfigurationGroup, "minio_secret_key")
	if err != nil {
		return business.Store{}, fmt.Errorf("cannot read the tenant store's secret key: %w", err)
	}
	return business.Store{Endpoint: endpoint, AccessKey: accessKey, Secret: secret}, nil
}

// withToken sends a gateway's token on every unary call.
func withToken(token string) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req, reply any, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		return invoker(metadata.AppendToOutgoingContext(ctx, gatewayTokenHeader, token), method, req, reply, cc, opts...)
	}
}

// withTokenStream sends a gateway's token on every streaming call.
func withTokenStream(token string) grpc.StreamClientInterceptor {
	return func(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, opts ...grpc.CallOption) (grpc.ClientStream, error) {
		return streamer(metadata.AppendToOutgoingContext(ctx, gatewayTokenHeader, token), desc, cc, method, opts...)
	}
}
