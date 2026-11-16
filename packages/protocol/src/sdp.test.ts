import { describe, expect, it } from "vitest";
import { preferStereoOpus } from "./sdp";

const base = [
  "v=0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111 63",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "a=rtpmap:63 red/48000/2",
  "",
].join("\r\n");

describe("preferStereoOpus", () => {
  it("adds stereo params to the existing opus fmtp line", () => {
    const out = preferStereoOpus(base);
    expect(out).toContain(
      "a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000\r\n",
    );
  });

  it("is idempotent", () => {
    expect(preferStereoOpus(preferStereoOpus(base))).toBe(preferStereoOpus(base));
  });

  it("adds an fmtp line when none exists", () => {
    const noFmtp = base.replace("a=fmtp:111 minptime=10;useinbandfec=1\r\n", "");
    expect(preferStereoOpus(noFmtp)).toContain(
      "a=rtpmap:111 opus/48000/2\r\na=fmtp:111 stereo=1;sprop-stereo=1;maxaveragebitrate=128000",
    );
  });

  it("leaves SDP without opus alone", () => {
    expect(preferStereoOpus("v=0\r\n")).toBe("v=0\r\n");
  });
});
