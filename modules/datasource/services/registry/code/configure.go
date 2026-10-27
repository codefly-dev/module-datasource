package main

import (
	"context"

	"registry/pkg/adapters"
	"registry/pkg/business"
)

func init() {
	WithConfigure(configureService)
}

// configureService installs the catalog.
//
// It resolves nothing and dials nothing, which is the point: the registry has
// no dependency on any datasource, so composing a new one cannot require a
// change here.
func configureService(_ context.Context, config *adapters.Configuration) (Clean, error) {
	config.Service = business.New()
	return nil, nil
}
