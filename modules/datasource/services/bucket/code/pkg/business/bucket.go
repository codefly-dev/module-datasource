// Package business reads an object store as a datasource.
//
// Everything about a store that is a store — the backends, the signing, the
// public-destination guard, the size caps — belongs to the object-storage
// gateway this package calls. What is here is the datasource part: naming a
// source, describing an item in the host's terms, and carrying a credential
// for exactly one call.
package business

import (
	"context"
	"errors"
	"io"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	codefly "github.com/codefly-dev/sdk-go"

	gen "bucket/pkg/gen"
	storagev0 "bucket/pkg/gen/storage/codefly/storage/v0"
)

// Datasource reads buckets through the composed object-storage gateway.
type Datasource struct {
	gen.UnimplementedBucketServiceServer

	gateway storagev0.ObjectStorageClient
}

// New builds the datasource over a gateway client the caller already dialled.
func New(gateway storagev0.ObjectStorageClient) *Datasource {
	return &Datasource{gateway: gateway}
}

// Version answers which build is serving.
//
// The generated adapter serves this only until a service supplies its own
// implementation; this type is that implementation, so without this method the
// endpoint answers Unimplemented.
func (d *Datasource) Version(_ context.Context, _ *gen.VersionRequest) (*gen.VersionResponse, error) {
	return &gen.VersionResponse{Version: codefly.ServiceVersion()}, nil
}

// Description is what this datasource says about itself. It is a package
// function because two callers need the same answer — the Describe RPC and the
// announcement this service makes to the registry — and a datasource that
// described itself two ways could be in the catalog as something it is not.
func Description() *gen.DescribeResponse {
	return &gen.DescribeResponse{
		Name:  "bucket",
		Title: "Object store",
		// The kinds the gateway registers as remote backends. A deployment
		// that reaches a store this list does not name reaches it as "s3" if
		// the store speaks S3; nothing else is admitted.
		Kinds:              []string{"s3", "minio", "gcs", "azure"},
		RequiresCredential: true,
		Streams:            true,
	}
}

// Describe introduces this datasource to a registry that knows nothing about
// it. The registry's catalog is the composed datasources' own answers to this,
// which is what lets a deployment add one without the registry changing.
func (d *Datasource) Describe(_ context.Context, _ *gen.DescribeRequest) (*gen.DescribeResponse, error) {
	return Description(), nil
}

// ListItems answers one page of a source's items.
//
// A page is complete or it is an error: the gateway fails a bound listing that
// a store marked truncated without a continuation token, so an empty
// next_page_token here means the listing finished.
func (d *Datasource) ListItems(ctx context.Context, req *gen.ListItemsRequest) (*gen.ListItemsResponse, error) {
	binding, err := bind(req.GetSource(), req.GetCredential())
	if err != nil {
		return nil, err
	}
	result, err := d.gateway.List(ctx, &storagev0.ListRequest{
		PageToken: req.GetPageToken(),
		Limit:     req.GetLimit(),
		Binding:   binding,
	})
	if err != nil {
		return nil, err
	}
	items := make([]*gen.Item, 0, len(result.GetObjects()))
	for _, object := range result.GetObjects() {
		items = append(items, item(object))
	}
	return &gen.ListItemsResponse{Items: items, NextPageToken: result.GetNextPageToken()}, nil
}

// FetchItem streams one item's bytes. The first chunk carries the item the
// stream is answering for, so a consumer learns the version it actually read
// rather than the one it asked for.
func (d *Datasource) FetchItem(req *gen.FetchItemRequest, out gen.BucketService_FetchItemServer) error {
	binding, err := bind(req.GetSource(), req.GetCredential())
	if err != nil {
		return err
	}
	stream, err := d.gateway.Get(out.Context(), &storagev0.GetRequest{
		Key: req.GetKey(),
		// A version the caller named is a precondition, not a selector: the
		// read happens only while the item still carries it.
		IfMatch: req.GetVersion(),
		Binding: binding,
	})
	if err != nil {
		return err
	}
	for {
		message, err := stream.Recv()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		switch kind := message.GetKind().(type) {
		case *storagev0.GetResponse_Header:
			if kind.Header.GetNotModified() {
				return status.Errorf(codes.FailedPrecondition, "item %q still carries the version the request named", req.GetKey())
			}
			if err = out.Send(&gen.FetchItemChunk{Item: item(kind.Header.GetInfo())}); err != nil {
				return err
			}
		case *storagev0.GetResponse_Data:
			if err = out.Send(&gen.FetchItemChunk{Data: kind.Data}); err != nil {
				return err
			}
		}
	}
}

// item describes a stored object in the host's terms.
func item(info *storagev0.ObjectInfo) *gen.Item {
	described := &gen.Item{
		Key:         info.GetKey(),
		SizeBytes:   info.GetSize(),
		ContentType: info.GetContentType(),
	}
	// A version is an identity: equal means unchanged. A weak ETag does not
	// promise that — two bodies a store considers equivalent share one — so it
	// is not answered as a version at all. A consumer then re-reads rather
	// than trusting an equality the store never made.
	if !info.GetWeakEtag() {
		described.Version = info.GetEtag()
	}
	if millis := info.GetLastModifiedUnixMs(); millis != 0 {
		described.ModifiedAt = timestamppb.New(timeFromUnixMillis(millis))
	}
	return described
}

// timeFromUnixMillis reads the store's own millisecond stamp.
func timeFromUnixMillis(millis int64) time.Time {
	return time.UnixMilli(millis).UTC()
}

// bind maps a source and its one-call credential onto the gateway's binding.
//
// The credential is required. A bound call never falls back to the gateway's
// own identity, and refusing an absent one here is what keeps a source with
// no credential from quietly reading the deployment's own bucket instead of
// the tenant's. Nothing in this function logs or returns it.
func bind(source *gen.Source, credential *gen.Credential) (*storagev0.Binding, error) {
	if source == nil {
		return nil, status.Error(codes.InvalidArgument, "no source")
	}
	if source.GetKind() == "" || source.GetBucket() == "" {
		return nil, status.Error(codes.InvalidArgument, "a source names a kind and a bucket")
	}
	material, err := material(credential)
	if err != nil {
		return nil, err
	}
	return &storagev0.Binding{
		Kind:       source.GetKind(),
		Endpoint:   source.GetEndpoint(),
		Region:     source.GetRegion(),
		Bucket:     source.GetBucket(),
		Prefix:     source.GetPrefix(),
		Credential: material,
	}, nil
}

// material translates the one credential form a call carries.
//
// A Google service-account JSON key is not translated, because this datasource
// does not accept one: key creation is refused by organization policy, so the
// only Google credential is a short-lived token the caller minted for this
// call.
func material(credential *gen.Credential) (*storagev0.Credential, error) {
	switch kind := credential.GetKind().(type) {
	case *gen.Credential_AccessKey:
		if kind.AccessKey.GetId() == "" || kind.AccessKey.GetSecret() == "" {
			return nil, status.Error(codes.InvalidArgument, "an access key carries an id and a secret")
		}
		return &storagev0.Credential{Kind: &storagev0.Credential_AccessKey{
			AccessKey: &storagev0.AccessKey{
				Id:     kind.AccessKey.GetId(),
				Secret: kind.AccessKey.GetSecret(),
			},
		}}, nil
	case *gen.Credential_AccessToken:
		if kind.AccessToken == "" {
			return nil, status.Error(codes.InvalidArgument, "an access token is empty")
		}
		return &storagev0.Credential{Kind: &storagev0.Credential_AccessToken{
			AccessToken: kind.AccessToken,
		}}, nil
	default:
		return nil, status.Error(codes.InvalidArgument, "a read needs a credential for this one call")
	}
}
