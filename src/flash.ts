export const FLASH_INTERVAL_MS = 500;
export const FLASH_FRAMES = 12;

export function runFlash(
  frames: { normal: string; highlight: string },
  setImage: (image: string) => Promise<void>,
  onError: (error: unknown) => void,
): () => void {
  let shown = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const cancel = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  const showNext = () => {
    const image = shown % 2 === 0 ? frames.highlight : frames.normal;
    shown++;
    try {
      void setImage(image).catch(onError);
    } catch (error) {
      onError(error);
    }
    if (shown >= FLASH_FRAMES) cancel();
  };

  showNext();
  if (shown < FLASH_FRAMES) timer = setInterval(showNext, FLASH_INTERVAL_MS);
  return cancel;
}
