// 遊玩支援範圍：主要輸入為觸控且無法懸停的裝置（手機、平板）不支援遊玩。
// 依瀏覽器回報的主要指標判斷，不看 User-Agent 或螢幕寬度，避免誤擋觸控筆電與縮小的桌面視窗。

export const UNSUPPORTED_QUERY = "(pointer: coarse) and (hover: none)";

type MediaQuery = Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">;
export type MatchMedia = (query: string) => MediaQuery;

export function deviceSupport(matchMedia: MatchMedia = (q) => window.matchMedia(q)) {
  const query = matchMedia(UNSUPPORTED_QUERY);
  return {
    get supported() {
      return !query.matches;
    },
    /** 主要輸入改變時（例如平板接上觸控板）回報新結果；回傳取消訂閱函式。 */
    onChange(listener: (supported: boolean) => void) {
      const handler = () => listener(!query.matches);
      query.addEventListener("change", handler);
      return () => query.removeEventListener("change", handler);
    },
  };
}
