package business

import (
	"strings"
	"testing"

	gen "bucket/pkg/gen"
	storagev0 "bucket/pkg/gen/storage/codefly/storage/v0"
)

func source() *gen.Source {
	return &gen.Source{Kind: "minio", Endpoint: "http://localhost:9000", Bucket: "tenant"}
}

// A bound read never falls back to the gateway's own identity, so a source
// with no credential is refused here rather than reading the deployment's own
// bucket under the tenant's name.
func TestBindRefusesACallWithNoCredential(t *testing.T) {
	if _, err := bind(source(), nil); err == nil {
		t.Fatal("a read with no credential was admitted")
	}
	empty := &gen.Credential{Kind: &gen.Credential_AccessKey{AccessKey: &gen.AccessKey{Id: "id"}}}
	if _, err := bind(source(), empty); err == nil {
		t.Fatal("an access key with no secret was admitted")
	}
}

// The credential is the host's, for one call. It reaches the gateway and
// nothing else: it is never part of what this service answers.
func TestTheCredentialNeverLeavesTheBinding(t *testing.T) {
	const secret = "s3cr3t-for-one-call"
	bound, err := bind(source(), &gen.Credential{Kind: &gen.Credential_AccessKey{
		AccessKey: &gen.AccessKey{Id: "id", Secret: secret},
	}})
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	if got := bound.GetCredential().GetAccessKey().GetSecret(); got != secret {
		t.Fatalf("the gateway was handed %q, not the call's credential", got)
	}
	// What a consumer sees of a read is an Item. Describing one reads the
	// store's answer, never the request, so no credential can reach it.
	described := item(&storagev0.ObjectInfo{Key: "report.csv", Etag: "abc", Size: 12})
	if strings.Contains(described.String(), secret) {
		t.Fatal("an item carried the call's credential")
	}
}

// A weak ETag is not an identity: two bodies a store considers equivalent
// share one. Answering it as a version would make "equal means unchanged"
// false, so it is not answered at all.
func TestAWeakEtagIsNotAVersion(t *testing.T) {
	strong := item(&storagev0.ObjectInfo{Key: "a", Etag: "abc"})
	if strong.GetVersion() != "abc" {
		t.Fatalf("a strong etag was dropped: %q", strong.GetVersion())
	}
	weak := item(&storagev0.ObjectInfo{Key: "a", Etag: "abc", WeakEtag: true})
	if weak.GetVersion() != "" {
		t.Fatalf("a weak etag was answered as a version: %q", weak.GetVersion())
	}
}

// A source is a kind and a bucket; without them there is nothing to read.
func TestBindRefusesAnIncompleteSource(t *testing.T) {
	credential := &gen.Credential{Kind: &gen.Credential_AccessToken{AccessToken: "t"}}
	for name, incomplete := range map[string]*gen.Source{
		"no source": nil,
		"no kind":   {Bucket: "tenant"},
		"no bucket": {Kind: "minio"},
	} {
		if _, err := bind(incomplete, credential); err == nil {
			t.Fatalf("%s was admitted", name)
		}
	}
}
