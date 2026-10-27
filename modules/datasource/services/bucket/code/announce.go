package main

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/codefly-dev/core/standards"
	"github.com/codefly-dev/core/wool"
	codefly "github.com/codefly-dev/sdk-go"

	"bucket/pkg/business"
	registryapi "bucket/pkg/clients/registry"
)

func init() {
	WithWork(announce)
}

// announce publishes this datasource to the registry and keeps renewing.
//
// The edge points this way on purpose. The registry depends on no datasource,
// so composing a new one changes nothing in it — which is the module's one
// rule, held by the shape of the dependency rather than by anyone remembering
// it. What a datasource announces is its own Describe answer, so there is one
// description and not two that can disagree.
//
// A registry that cannot be reached is not fatal: the datasource still serves
// every consumer that already knows its address. It keeps trying, and the
// catalog fills in when the registry is back.
func announce(ctx context.Context) (Clean, error) {
	instance, err := codefly.For(ctx).Service("registry").API(standards.GRPC).ResolveNetworkInstance()
	if err != nil {
		return nil, fmt.Errorf("cannot resolve the registry: %w", err)
	}
	self, err := codefly.For(ctx).API(standards.GRPC).ResolveNetworkInstance()
	if err != nil {
		return nil, fmt.Errorf("cannot resolve this service's own address: %w", err)
	}
	connection, err := grpc.NewClient(instance.Address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("cannot dial the registry: %w", err)
	}

	described := business.Description()
	announcement := &registryapi.AnnounceRequest{Datasource: &registryapi.Datasource{
		Name:               described.GetName(),
		Title:              described.GetTitle(),
		Kinds:              described.GetKinds(),
		RequiresCredential: described.GetRequiresCredential(),
		Streams:            described.GetStreams(),
		Address:            self.Address,
	}}

	announcing, stop := context.WithCancel(ctx)
	go renew(announcing, registryapi.NewRegistryServiceClient(connection), announcement)
	return func() {
		stop()
		_ = connection.Close()
	}, nil
}

// renew announces until the service stops, at the interval the registry asks
// for. The registry owns that interval: it is the one that decides when an
// announcement has gone stale.
func renew(ctx context.Context, registry registryapi.RegistryServiceClient, announcement *registryapi.AnnounceRequest) {
	log := wool.Get(ctx).In("announce")
	// Until the registry has answered once, retry briskly: a datasource that
	// started before the registry should join the catalog promptly, not after
	// a full lease.
	every := 5 * time.Second
	for {
		response, err := registry.Announce(ctx, announcement)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Warn("cannot announce to the registry; the datasource still serves its consumers", wool.ErrField(err))
		} else if seconds := response.GetRenewWithinSeconds(); seconds > 0 {
			every = time.Duration(seconds) * time.Second
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(every):
		}
	}
}
