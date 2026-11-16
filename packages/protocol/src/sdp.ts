/**
 * Ask for high-quality stereo Opus on the receiving side. Chrome's sender follows the
 * receiver's fmtp, so the guest applies this to its answer. Tab audio is music and film,
 * not voice, so the default mono ~32 kbps sounds noticeably worse.
 */
export function preferStereoOpus(sdp: string, maxAverageBitrate = 128_000): string {
  const opus = sdp.match(/^a=rtpmap:(\d+) opus\/48000\/2(?=\r?$)/im);
  if (!opus) return sdp;
  const pt = opus[1];
  const params = `stereo=1;sprop-stereo=1;maxaveragebitrate=${maxAverageBitrate}`;
  const fmtp = new RegExp(`^(a=fmtp:${pt} )(.*?)(\\r?)$`, "m");
  if (fmtp.test(sdp)) {
    return sdp.replace(fmtp, (_m, head: string, rest: string, cr: string) => {
      const kept = rest
        .split(";")
        .filter((p) => p && !/^(stereo|sprop-stereo|maxaveragebitrate)=/.test(p.trim()));
      return `${head}${[...kept, params].join(";")}${cr}`;
    });
  }
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  return sdp.replace(opus[0], `${opus[0]}${eol}a=fmtp:${pt} ${params}`);
}
