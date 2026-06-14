import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://zsctest.github.io",
    title: "Zst0ry's Blog",
    description: "一些关于网络安全的记录和思考",
    author: "Zst0ry",
    profile: "https://github.com/zsctest",
    ogImage: "default-og.jpg",
    lang: "zh-CN",
    timezone: "Asia/Shanghai",
    dir: "ltr",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: false
    },
    search: "pagefind",
  },
  socials: [
    { name: "github",   url: "https://github.com/zsctest" },
    { name: "mail",     url: "mailto:zsc13791@163.com" },
  ],
  shareLinks: [
    { name: "mail",     url: "mailto:?subject=See%20this%20post&body=" },
  ],
});