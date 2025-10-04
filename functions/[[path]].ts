import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";
// @ts-ignore - build output
import * as build from "../build/server";

export const onRequest = createPagesFunctionHandler({ build });
