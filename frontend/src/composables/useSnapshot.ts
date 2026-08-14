import { ref, watch, type Ref } from "vue";
import { connectSnapshot } from "../api/ws";
import type { SeriesRef, Snapshot } from "../api/types";

export function useSnapshot(series: Ref<SeriesRef>, interval = 5): Ref<Snapshot | null> {
  const snap = ref<Snapshot | null>(null);
  const seriesKey = () =>
    `${series.value.category}/${series.value.symbol}/${series.value.timeframe}`;

  watch(
    seriesKey,
    (_value, _old, onCleanup) => {
      const conn = connectSnapshot(series.value, (s) => (snap.value = s), interval);
      onCleanup(() => conn.close());
    },
    { immediate: true, flush: "post" },
  );

  return snap;
}
