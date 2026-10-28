package business

import (
	"context"
	"testing"

	gen "registry/pkg/gen"
)

// Supplying our own server replaces the generated Version-only one, so a
// method we forget to carry over answers Unimplemented — which is how the
// playground came to badge a capability "Demonstrated" that returned 501.
func TestVersionIsServed(t *testing.T) {
	answer, err := New().Version(context.Background(), &gen.VersionRequest{})
	if err != nil {
		t.Fatalf("Version: %v", err)
	}
	if answer == nil {
		t.Fatal("Version answered nothing")
	}
}
