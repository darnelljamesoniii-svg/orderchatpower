import type { PlaceDetails, NearbyPlace } from "@/lib/google-places";

type Props = {
  business: PlaceDetails;
  competitors: {
    tier1: NearbyPlace[];
    tier2: NearbyPlace[];
    tier3: NearbyPlace[];
  };
  stopped: boolean;
};

export default function ActivityPulse(_props: Props) {
  return null; // stubbed for now
}
