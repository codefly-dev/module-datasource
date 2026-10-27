package business

import (
	"context"
	"testing"
	"time"

	gen "registry/pkg/gen"
)

func catalogAt(now *time.Time) *Catalog {
	c := New()
	c.now = func() time.Time { return *now }
	return c
}

func announce(t *testing.T, c *Catalog, name string) {
	t.Helper()
	if _, err := c.Announce(context.Background(), &gen.AnnounceRequest{
		Datasource: &gen.Datasource{Name: name, Address: "localhost:1", Kinds: []string{"minio"}},
	}); err != nil {
		t.Fatalf("announce %s: %v", name, err)
	}
}

func names(t *testing.T, c *Catalog) []string {
	t.Helper()
	catalog, err := c.GetCatalog(context.Background(), &gen.GetCatalogRequest{})
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}
	var out []string
	for _, datasource := range catalog.GetDatasources() {
		out = append(out, datasource.GetName())
	}
	return out
}

// The catalog is what the deployment composed, and the registry learns it
// without naming anything: two datasources it has never heard of announce,
// and both are in the catalog, in name order.
func TestTheCatalogIsWhatAnnouncedItself(t *testing.T) {
	now := time.Now()
	c := catalogAt(&now)
	announce(t, c, "warehouse")
	announce(t, c, "bucket")
	got := names(t, c)
	if len(got) != 2 || got[0] != "bucket" || got[1] != "warehouse" {
		t.Fatalf("catalog is %v", got)
	}
}

// A datasource that stopped running leaves the catalog by itself, so a
// consumer is never handed an address nothing answers at.
func TestAnAnnouncementLapses(t *testing.T) {
	now := time.Now()
	c := catalogAt(&now)
	announce(t, c, "bucket")
	now = now.Add(lease + time.Second)
	if got := names(t, c); len(got) != 0 {
		t.Fatalf("a lapsed datasource is still in the catalog: %v", got)
	}
}

// Renewing inside the lease keeps a datasource in the catalog indefinitely.
func TestRenewingKeepsADatasource(t *testing.T) {
	now := time.Now()
	c := catalogAt(&now)
	announce(t, c, "bucket")
	for range 5 {
		now = now.Add(renewWithin)
		announce(t, c, "bucket")
	}
	now = now.Add(renewWithin)
	if got := names(t, c); len(got) != 1 {
		t.Fatalf("a renewed datasource left the catalog: %v", got)
	}
}

// Announcing again replaces what the catalog holds: the datasource is the
// authority on what it can do.
func TestAnnouncingReplacesWhatTheCatalogHolds(t *testing.T) {
	now := time.Now()
	c := catalogAt(&now)
	announce(t, c, "bucket")
	if _, err := c.Announce(context.Background(), &gen.AnnounceRequest{
		Datasource: &gen.Datasource{Name: "bucket", Address: "localhost:2", Kinds: []string{"minio", "s3"}, Streams: true},
	}); err != nil {
		t.Fatalf("re-announce: %v", err)
	}
	catalog, err := c.GetCatalog(context.Background(), &gen.GetCatalogRequest{})
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}
	if len(catalog.GetDatasources()) != 1 {
		t.Fatalf("re-announcing duplicated the datasource: %d", len(catalog.GetDatasources()))
	}
	only := catalog.GetDatasources()[0]
	if only.GetAddress() != "localhost:2" || len(only.GetKinds()) != 2 || !only.GetStreams() {
		t.Fatalf("the catalog kept the earlier announcement: %v", only)
	}
}

// An announcement a consumer could not act on is refused, rather than put in
// the catalog for someone to fail on later.
func TestAnIncompleteAnnouncementIsRefused(t *testing.T) {
	now := time.Now()
	c := catalogAt(&now)
	for name, incomplete := range map[string]*gen.Datasource{
		"nothing":    nil,
		"no name":    {Address: "localhost:1"},
		"no address": {Name: "bucket"},
	} {
		if _, err := c.Announce(context.Background(), &gen.AnnounceRequest{Datasource: incomplete}); err == nil {
			t.Fatalf("%s was admitted", name)
		}
	}
}
