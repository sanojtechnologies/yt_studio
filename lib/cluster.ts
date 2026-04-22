import { YouTubeVideo } from "@/types/youtube";

export interface EmbeddedItem {
  videoId: string;
  embedding: number[];
}

export interface TopicCluster {
  id: number;
  videoIds: string[];
  /** Per-cluster centroid in the embedding space (normalised). */
  centroid: number[];
  /** Members sorted by distance to centroid (closest first). */
  representativeVideoIds: string[];
}

/**
 * Cosine similarity in [-1, 1]. Returns 0 when either vector is degenerate so
 * the agglomerative loop never receives NaN — that would break the heap and
 * silently produce nonsensical clusters.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function add(a: number[], b: number[]): number[] {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

function scale(v: number[], factor: number): number[] {
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * factor;
  return out;
}

interface WorkingCluster {
  id: number;
  members: EmbeddedItem[];
  centroid: number[];
}

/**
 * Average-linkage agglomerative clustering using cosine similarity. We bound
 * by `desiredClusters` rather than a similarity cutoff because product UX
 * needs a predictable column count (4-6 themes); a cutoff would be subject to
 * embedding-magnitude drift across model versions.
 *
 * Complexity is O(n^2 log n). At n=50 (the dashboard sample size) this is
 * trivial; refuses to run for n>500 to keep the seam honest if a future
 * caller forgets the cap.
 */
export function clusterByEmbedding(
  items: EmbeddedItem[],
  desiredClusters = 5
): TopicCluster[] {
  if (items.length === 0) return [];
  if (items.length > 500) {
    throw new Error("clusterByEmbedding refuses to run on > 500 items");
  }
  const targetCount = Math.max(1, Math.min(desiredClusters, items.length));

  let clusters: WorkingCluster[] = items.map((item, index) => ({
    id: index,
    members: [item],
    centroid: [...item.embedding],
  }));

  while (clusters.length > targetCount) {
    let bestI = 0;
    let bestJ = 1;
    let bestSim = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = cosineSimilarity(clusters[i].centroid, clusters[j].centroid);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const merged: WorkingCluster = {
      id: clusters[bestI].id,
      members: [...clusters[bestI].members, ...clusters[bestJ].members],
      centroid: scale(
        add(
          scale(clusters[bestI].centroid, clusters[bestI].members.length),
          scale(clusters[bestJ].centroid, clusters[bestJ].members.length)
        ),
        1 / (clusters[bestI].members.length + clusters[bestJ].members.length)
      ),
    };
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }

  return clusters
    .map((cluster, index) => {
      const ranked = [...cluster.members].sort(
        (a, b) =>
          cosineSimilarity(cluster.centroid, b.embedding) -
          cosineSimilarity(cluster.centroid, a.embedding)
      );
      return {
        id: index,
        videoIds: cluster.members.map((m) => m.videoId),
        centroid: cluster.centroid,
        representativeVideoIds: ranked.map((m) => m.videoId),
      };
    })
    .sort((a, b) => b.videoIds.length - a.videoIds.length);
}

export interface AggregateClusterStats {
  clusterId: number;
  totalVideos: number;
  avgViews: number;
  medianViews: number;
  representativeTitles: string[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function summarizeClusters(
  clusters: TopicCluster[],
  videos: YouTubeVideo[],
  representativesPerCluster = 3
): AggregateClusterStats[] {
  const byId = new Map(videos.map((v) => [v.id, v]));
  return clusters.map((cluster) => {
    const members = cluster.videoIds
      .map((id) => byId.get(id))
      .filter((v): v is YouTubeVideo => Boolean(v));
    const views = members.map((m) => m.viewCount);
    const total = views.reduce((s, v) => s + v, 0);
    return {
      clusterId: cluster.id,
      totalVideos: members.length,
      avgViews: members.length > 0 ? total / members.length : 0,
      medianViews: median(views),
      representativeTitles: cluster.representativeVideoIds
        .slice(0, representativesPerCluster)
        .map((id) => byId.get(id)?.title)
        .filter((t): t is string => Boolean(t)),
    };
  });
}
