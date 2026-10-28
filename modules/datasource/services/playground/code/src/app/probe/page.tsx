import { RegistryService } from "@codefly-dev/datasource-registry-client";
import { BucketService } from "@codefly-dev/datasource-bucket-client";
export default function Probe() { return <p>{RegistryService.typeName} {BucketService.typeName}</p>; }
