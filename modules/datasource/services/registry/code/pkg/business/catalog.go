// Package business holds the datasource catalog.
//
// There is deliberately nothing here about any particular datasource. The one
// rule this module exists to hold is that a new datasource is added by adding
// code and never by changing existing code, and a registry that knew what a
// bucket was — a provider table, a switch, a list of names, a blank import —
// would be the first thing that has to change. So it knows none of that: a
// datasource announces itself, and the catalog is what is announced.
package business

import (
	"context"
	"sort"
	"sync"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	gen "registry/pkg/gen"
)

// lease is how long one announcement stands. A datasource renews well inside
// it; one that stopped running falls out of the catalog by itself, which is
// why the catalog can be trusted as what is running rather than what was once
// configured.
const lease = 90 * time.Second

// renewWithin is what a datasource is told to renew inside: comfortably less
// than the lease, so an announcement that is merely late does not drop a
// healthy datasource out of the catalog.
const renewWithin = 30 * time.Second

// Catalog is every datasource currently announced.
type Catalog struct {
	gen.UnimplementedRegistryServiceServer

	// now is time.Now in production, and a test's clock otherwise: a lease is
	// the whole behaviour here, so it has to be observable without waiting.
	now func() time.Time

	mu        sync.RWMutex
	announced map[string]announcement
}

// announcement is one datasource and when its place in the catalog lapses.
type announcement struct {
	datasource *gen.Datasource
	lapses     time.Time
}

// New builds an empty catalog.
func New() *Catalog {
	return &Catalog{now: time.Now, announced: map[string]announcement{}}
}

// Announce publishes a datasource or renews it. Announcing again replaces what
// the catalog holds: a datasource is the authority on what it can do, and the
// registry keeps no opinion to merge with.
func (c *Catalog) Announce(_ context.Context, req *gen.AnnounceRequest) (*gen.AnnounceResponse, error) {
	datasource := req.GetDatasource()
	if datasource.GetName() == "" {
		return nil, status.Error(codes.InvalidArgument, "a datasource announces a name")
	}
	if datasource.GetAddress() == "" {
		return nil, status.Error(codes.InvalidArgument, "a datasource announces the address its own API is reached at")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.announced[datasource.GetName()] = announcement{
		datasource: datasource,
		lapses:     c.now().Add(lease),
	}
	return &gen.AnnounceResponse{RenewWithinSeconds: int64(renewWithin.Seconds())}, nil
}

// GetCatalog answers every datasource whose announcement still stands, in name
// order so two reads of an unchanged catalog read the same.
func (c *Catalog) GetCatalog(_ context.Context, _ *gen.GetCatalogRequest) (*gen.GetCatalogResponse, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	datasources := make([]*gen.Datasource, 0, len(c.announced))
	for name, entry := range c.announced {
		// A lapsed announcement is dropped as it is found: the catalog is read
		// far more often than it changes, so there is nothing for a sweeper to
		// do that reading cannot do itself.
		if entry.lapses.Before(now) {
			delete(c.announced, name)
			continue
		}
		datasources = append(datasources, entry.datasource)
	}
	sort.Slice(datasources, func(i, j int) bool { return datasources[i].GetName() < datasources[j].GetName() })
	return &gen.GetCatalogResponse{Datasources: datasources}, nil
}
