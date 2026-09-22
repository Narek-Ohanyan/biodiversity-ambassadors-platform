let handler = () => {};
export const setRouter = (fn) => { handler = fn; };
export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search && !replace) { handler(); return; }
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  handler();
}
