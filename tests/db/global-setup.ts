import type { TestProject } from "vitest/node";
import { startCluster } from "./cluster";

declare module "vitest" {
  export interface ProvidedContext {
    pg: { host: string; port: number };
  }
}

export default async function setup(project: TestProject) {
  const cluster = await startCluster();
  project.provide("pg", { host: cluster.host, port: cluster.port });
  return () => cluster.stop();
}
