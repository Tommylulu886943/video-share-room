export function webUrl(value) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 8192) {
    throw new Error("請使用不含帳號密碼的 HTTP(S) 網址。");
  }
  return url;
}

export function importUrl(source, title) {
  const target = new URL("https://video-share-room.vercel.app/import");
  target.searchParams.set("url", webUrl(source).href);
  target.searchParams.set("title", title.trim().slice(0, 140));
  return target.href;
}
