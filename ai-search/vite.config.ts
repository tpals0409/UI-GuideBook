// `cf build`·`cf deploy`가 Worker를 묶을 때 이 파일을 거쳐요 (vite로 위임). 지우면 "Cannot resolve entry module index.html"로 배포가 실패해요.
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({ plugins: [cloudflare()] });
