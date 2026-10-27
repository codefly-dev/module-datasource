// Package business runs the datasource module's proof.
//
// It plays the part the host plays in a deployment: it holds the tenant
// store's credential and hands one over for a single call. Nothing here is a
// stub — the write goes to a real store and the read comes back through the
// real datasource — so a step that passes here is the path that runs in
// production, minus who kept the credential.
package business

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	bucketapi "playground/pkg/clients/bucket"
	storagev0 "playground/pkg/clients/storage/codefly/storage/v0"
	gen "playground/pkg/gen"
)

// Store is the tenant store as a caller must name it: where the datasource's
// gateway reaches it, which bucket to read, and the credential that opens it.
// A deployment takes these from the host; a local run takes them from the
// composition.
type Store struct {
	// Endpoint is the store's http origin, as the datasource's gateway
	// reaches it. It is a name, never an address literal: a bound call to a
	// non-public destination is admitted only as a composed endpoint.
	Endpoint string
	// AccessKey opens it.
	AccessKey string
	// Secret pairs with AccessKey. It is never logged and never reported.
	Secret string
}

// defaultBucket is what the object-storage agent calls the bucket of a store
// with none configured. The agent publishes no bucket name to its dependents,
// so a proof that is not told one falls back to the agent's documented default
// rather than failing on a value a person did not have to care about.
const defaultBucket = "documents"

// Proof exercises the bucket datasource against the composed tenant store.
type Proof struct {
	gen.UnimplementedPlaygroundServiceServer

	// tenant is the tenant store's own gateway. The write goes through it,
	// because writing is not a bound operation: only reads take a binding.
	tenant storagev0.ObjectStorageClient
	// datasource is the subject of the proof.
	datasource bucketapi.BucketServiceClient
	store      Store
}

// New builds the proof over clients the caller already dialled.
func New(tenant storagev0.ObjectStorageClient, datasource bucketapi.BucketServiceClient, store Store) *Proof {
	return &Proof{tenant: tenant, datasource: datasource, store: store}
}

// Prove writes an object into the tenant store and reads it back through the
// datasource. It stops at the first failure, because every later step would
// then be reporting on something that never happened.
func (p *Proof) Prove(ctx context.Context, req *gen.ProveRequest) (*gen.ProveResponse, error) {
	key := req.GetKey()
	if key == "" {
		key = fmt.Sprintf("proof/%d.txt", time.Now().UTC().UnixNano())
	}
	content := req.GetContent()
	if content == "" {
		content = "the datasource read this through a per-call credential"
	}
	bucket := req.GetBucket()
	if bucket == "" {
		bucket = defaultBucket
	}

	response := &gen.ProveResponse{}
	for _, step := range []struct {
		name string
		run  func(context.Context) (string, error)
	}{
		{"write into the tenant store", func(ctx context.Context) (string, error) { return p.write(ctx, bucket, key, content) }},
		{"the datasource describes itself", p.describe},
		{"list the source through the datasource", func(ctx context.Context) (string, error) { return p.list(ctx, bucket, key) }},
		{"fetch the item through the datasource", func(ctx context.Context) (string, error) { return p.fetch(ctx, bucket, key, content) }},
		{"a read with no credential is refused", func(ctx context.Context) (string, error) { return p.refused(ctx, bucket) }},
	} {
		detail, err := step.run(ctx)
		if err != nil {
			response.Steps = append(response.Steps, &gen.ProveStep{Name: step.name, Failure: err.Error()})
			return response, nil
		}
		response.Steps = append(response.Steps, &gen.ProveStep{Name: step.name, Detail: detail})
	}
	response.Proven = true
	return response, nil
}

// write puts the object through the tenant store's own gateway. This is the
// part a tenant does for itself in reality: the datasource only ever reads.
func (p *Proof) write(ctx context.Context, bucket, key, content string) (string, error) {
	stream, err := p.tenant.Put(ctx)
	if err != nil {
		return "", err
	}
	header := &storagev0.PutRequest{Kind: &storagev0.PutRequest_Header{
		Header: &storagev0.PutHeader{Key: key, ContentType: "text/plain", TotalSize: int64(len(content))},
	}}
	if err = stream.Send(header); err != nil {
		return "", err
	}
	if err = stream.Send(&storagev0.PutRequest{Kind: &storagev0.PutRequest_Data{Data: []byte(content)}}); err != nil {
		return "", err
	}
	result, err := stream.CloseAndRecv()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("wrote %s (%d bytes) into %s at version %q", key, len(content), bucket, result.GetEtag()), nil
}

// describe asks the datasource what it is — the same question a registry asks
// a datasource it knows nothing about.
func (p *Proof) describe(ctx context.Context) (string, error) {
	described, err := p.datasource.Describe(ctx, &bucketapi.DescribeRequest{})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s (%s): kinds %s, credential required=%t, streams=%t",
		described.GetName(), described.GetTitle(), strings.Join(described.GetKinds(), ", "),
		described.GetRequiresCredential(), described.GetStreams()), nil
}

// list reads the source through the datasource and looks for the key just
// written. A listing that comes back complete without it is a failure, not an
// empty answer.
func (p *Proof) list(ctx context.Context, bucket, key string) (string, error) {
	page, err := p.datasource.ListItems(ctx, &bucketapi.ListItemsRequest{
		Source:     p.source(bucket),
		Credential: p.credential(),
	})
	if err != nil {
		return "", err
	}
	for _, item := range page.GetItems() {
		if item.GetKey() != key {
			continue
		}
		return fmt.Sprintf("found %s, %d bytes, version %q, among %d item(s)",
			item.GetKey(), item.GetSizeBytes(), item.GetVersion(), len(page.GetItems())), nil
	}
	return "", fmt.Errorf("the listing returned %d item(s) and none was %s", len(page.GetItems()), key)
}

// fetch streams the item back and compares it with what was written. Comparing
// is the point: a stream that arrives in the wrong order or short is a bug the
// byte count alone would not show.
func (p *Proof) fetch(ctx context.Context, bucket, key, content string) (string, error) {
	stream, err := p.datasource.FetchItem(ctx, &bucketapi.FetchItemRequest{
		Source:     p.source(bucket),
		Credential: p.credential(),
		Key:        key,
	})
	if err != nil {
		return "", err
	}
	var described *bucketapi.Item
	var read strings.Builder
	for {
		chunk, err := stream.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", err
		}
		if chunk.GetItem() != nil {
			described = chunk.GetItem()
		}
		read.Write(chunk.GetData())
	}
	if described == nil {
		return "", errors.New("the stream carried no item")
	}
	if read.String() != content {
		return "", fmt.Errorf("read %d bytes, wrote %d, and they differ", read.Len(), len(content))
	}
	return fmt.Sprintf("read %d bytes of %s at version %q, byte-identical to what was written",
		read.Len(), described.GetKey(), described.GetVersion()), nil
}

// refused proves the rule the module is built on holds live: a bound read
// never falls back to the gateway's own identity, so a call carrying no
// credential must fail rather than quietly read the deployment's own store.
func (p *Proof) refused(ctx context.Context, bucket string) (string, error) {
	_, err := p.datasource.ListItems(ctx, &bucketapi.ListItemsRequest{Source: p.source(bucket)})
	if err == nil {
		return "", errors.New("a read with no credential was admitted")
	}
	return fmt.Sprintf("refused: %s", err), nil
}

// source names the tenant store the way any consumer would.
func (p *Proof) source(bucket string) *bucketapi.Source {
	return &bucketapi.Source{
		Kind:     "minio",
		Endpoint: p.store.Endpoint,
		Bucket:   bucket,
	}
}

// credential is the host's hand-over, for one call.
func (p *Proof) credential() *bucketapi.Credential {
	return &bucketapi.Credential{Kind: &bucketapi.Credential_AccessKey{
		AccessKey: &bucketapi.AccessKey{Id: p.store.AccessKey, Secret: p.store.Secret},
	}}
}
