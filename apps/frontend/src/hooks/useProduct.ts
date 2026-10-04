import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClient, createRealtime } from "../lib/api";
import { PRODUCT } from "../lib/product";
import type { Availability, Health, Market, Pretrade, RealtimeEvent } from "../lib/types";

export function useProduct() {
  const api = useMemo(() => new ApiClient(PRODUCT.apiUrl), []);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [streamState, setStreamState] = useState<Availability | "LIVE">("STALE");
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [marketResponse, healthResponse] = await Promise.all([api.markets(), api.health()]);
      setMarkets(marketResponse.items ?? []);
      setHealth(healthResponse);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "LIVE_API_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const stop = createRealtime(
      PRODUCT.apiUrl,
      (event) =>
        setEvents((previous) =>
          [event, ...previous.filter((item) => item.sequence !== event.sequence)].slice(0, 8),
        ),
      setStreamState,
    );
    return stop;
  }, []);
  return { api, markets, health, streamState, events, error, loading, refresh, product: PRODUCT };
}

export function useMarket(api: ApiClient, marketId: string | undefined) {
  const [market, setMarket] = useState<Market | null>(null);
  const [pretrade, setPretrade] = useState<Pretrade | null>(null);
  const [resources, setResources] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!marketId) return;
    let alive = true;
    void Promise.all([
      api.market(marketId),
      api.pretrade(marketId),
      ...["history", "proof", "holders", "deployer", "depth", "activity"].map((resource) =>
        api.resource(marketId, resource).then((value) => [resource, value] as const),
      ),
    ])
      .then(([nextMarket, nextPretrade, ...loaded]) => {
        if (!alive) return;
        setMarket(nextMarket as Market);
        setPretrade(nextPretrade as Pretrade);
        setResources(Object.fromEntries(loaded as Array<readonly [string, any]>));
        setError(null);
      })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : "MARKET_DATA_UNAVAILABLE");
      });
    return () => {
      alive = false;
    };
  }, [api, marketId]);
  return { market, pretrade, resources, error };
}
