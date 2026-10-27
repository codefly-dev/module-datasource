package main

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	"github.com/codefly-dev/core/standards"
	codefly "github.com/codefly-dev/sdk-go"

	"bucket/pkg/adapters"
	"bucket/pkg/business"
	storagev0 "bucket/pkg/gen/storage/codefly/storage/v0"
)

func init() {
	WithConfigure(configureService)
}

// gatewayTokenHeader is the metadata header the object-storage gateway
// authenticates a caller with.
const gatewayTokenHeader = "x-codefly-token"

// gatewayConfigurationGroup is the configuration group the object-storage
// agent publishes to the services that depend on it.
const gatewayConfigurationGroup = "object-storage"

// configureService dials the composed object-storage gateway and hands the datasource
// its client. The address and the gateway's own token are resolved, never
// written down: a deployment reaching a different gateway changes nothing here.
//
// Transport is plain inside the cell by design — the mesh carries it, and no
// service terminates its own TLS.
func configureService(ctx context.Context, config *adapters.Configuration) (Clean, error) {
	gateway := codefly.For(ctx).Service("storage")
	instance, err := gateway.API(standards.GRPC).ResolveNetworkInstance()
	if err != nil {
		return nil, fmt.Errorf("cannot resolve the object-storage gateway: %w", err)
	}
	token, err := gateway.Secret(gatewayConfigurationGroup, "token")
	if err != nil {
		return nil, fmt.Errorf("cannot read the object-storage gateway's token: %w", err)
	}
	connection, err := grpc.NewClient(instance.Address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithUnaryInterceptor(withToken(token)),
		grpc.WithStreamInterceptor(withTokenStream(token)),
	)
	if err != nil {
		return nil, fmt.Errorf("cannot dial the object-storage gateway: %w", err)
	}
	config.Service = business.New(storagev0.NewObjectStorageClient(connection))
	return func() { _ = connection.Close() }, nil
}

// withToken sends the gateway's token on every unary call.
func withToken(token string) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req, reply any, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		return invoker(metadata.AppendToOutgoingContext(ctx, gatewayTokenHeader, token), method, req, reply, cc, opts...)
	}
}

// withTokenStream sends the gateway's token on every streaming call.
func withTokenStream(token string) grpc.StreamClientInterceptor {
	return func(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, opts ...grpc.CallOption) (grpc.ClientStream, error) {
		return streamer(metadata.AppendToOutgoingContext(ctx, gatewayTokenHeader, token), desc, cc, method, opts...)
	}
}
