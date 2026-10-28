package business

import (
	"context"
	"testing"

	gen "bucket/pkg/gen"
)

// See the registry's equivalent: our own server replaces the generated
// Version-only one, so a dropped method answers Unimplemented.
func TestVersionIsServed(t *testing.T) {
	answer, err := New(nil).Version(context.Background(), &gen.VersionRequest{})
	if err != nil {
		t.Fatalf("Version: %v", err)
	}
	if answer == nil {
		t.Fatal("Version answered nothing")
	}
}
