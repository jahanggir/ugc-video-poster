import { useState, useRef, useCallback, useEffect } from "react";

const PRESET_SIZES = [
  { label: "1280×720", w: 1280, h: 720 },
  { label: "1920×1080", w: 1920, h: 1080 },
  { label: "854×480", w: 854, h: 480 },
  { label: "640×360", w: 640, h: 360 },
];

const FORMAT_OPTIONS = ["image/png", "image/jpeg", "image/webp"];
const FORMAT_LABELS = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP" };

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00.000";
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, "0");
  return `${m}:${s}.${ms}`;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/* Seek a video and wait for the decoded frame via double-rAF */
function seekAndWait(video, time, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("seek timeout"));
    }, timeoutMs);
    const onSeeked = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

export default function VideoThumbnailGenerator() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timelineRef = useRef(null);
  const fileInputRef = useRef(null);

  const [videoSrc, setVideoSrc] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [videoReady, setVideoReady] = useState(false);
  const [nativeSize, setNativeSize] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [thumbnail, setThumbnail] = useState(null);
  const [size, setSize] = useState(null);
  const [format, setFormat] = useState("image/png");
  const [quality, setQuality] = useState(0.92);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFrames, setPreviewFrames] = useState([]);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const allSizes = nativeSize
    ? [nativeSize, ...PRESET_SIZES.filter((p) => !(p.w === nativeSize.w && p.h === nativeSize.h))]
    : PRESET_SIZES;

  const sanitizeFilename = useCallback((name) => {
    return name.replace(/[^a-zA-Z0-9_\-\.]/g, "_").replace(/_{2,}/g, "_");
  }, []);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setVideoName(file.name.replace(/\.[^.]+$/, ""));
    setVideoReady(false);
    setThumbnail(null);
    setPreviewFrames([]);
    setCurrentTime(0);
    setNativeSize(null);
    setSize(null);
  }, [videoSrc]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer?.files?.[0]);
  }, [handleFile]);

  const handleFileInput = useCallback((e) => {
    handleFile(e.target.files?.[0]);
  }, [handleFile]);

  /* Generate timeline previews using a SEPARATE video element so main player stays put */
  const generatePreviewFrames = useCallback(async (src, dur) => {
    if (!dur) return;
    setIsGeneratingPreviews(true);
    const probe = document.createElement("video");
    probe.preload = "auto";
    probe.muted = true;
    probe.playsInline = true;
    probe.src = src;
    await new Promise((r) => { probe.oncanplay = r; probe.onerror = r; });

    const count = Math.min(12, Math.max(6, Math.floor(dur / 5)));
    const frames = [];
    const tc = document.createElement("canvas");
    tc.width = 160;
    tc.height = 90;
    const ctx = tc.getContext("2d");

    for (let i = 0; i < count; i++) {
      const time = (dur / count) * i + dur / (count * 2);
      try {
        await seekAndWait(probe, time, 4000);
        ctx.drawImage(probe, 0, 0, 160, 90);
        frames.push({ time, src: tc.toDataURL("image/jpeg", 0.5) });
      } catch {
        break;
      }
    }
    probe.src = "";
    setPreviewFrames(frames);
    setIsGeneratingPreviews(false);
  }, []);

  /* Video ready: detect native res, seek to first real frame, mark ready */
  const onLoadedData = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const native = { label: `${vw}×${vh} (native)`, w: vw, h: vh };
    setNativeSize(native);
    setSize(native);
    setDuration(video.duration);

    // Seek to a tiny offset — avoids the common black keyframe at exactly 0
    try { await seekAndWait(video, 0.001); } catch { /* ok */ }
    setVideoReady(true);
    generatePreviewFrames(video.src, video.duration);
  }, [generatePreviewFrames]);

  const seekToPosition = useCallback((clientX) => {
    const timeline = timelineRef.current;
    const video = videoRef.current;
    if (!timeline || !video || !duration) return;
    const rect = timeline.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const newTime = ratio * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const onTimelineMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    seekToPosition(e.clientX);
  }, [seekToPosition]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => seekToPosition(e.clientX);
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, seekToPosition]);

  const stepFrame = useCallback((direction) => {
    const video = videoRef.current;
    if (!video) return;
    const step = 1 / 30;
    const newTime = clamp(video.currentTime + step * direction, 0, duration);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const captureThumbnail = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !size) return;
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const videoAspect = vw / vh;
    const canvasAspect = size.w / size.h;
    let sx, sy, sw, sh;
    if (videoAspect > canvasAspect) {
      sh = vh; sw = vh * canvasAspect; sx = (vw - sw) / 2; sy = 0;
    } else {
      sw = vw; sh = vw / canvasAspect; sx = 0; sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size.w, size.h);
    const q = format === "image/png" ? undefined : quality;
    setThumbnail(canvas.toDataURL(format, q));
  }, [size, format, quality]);

  const downloadThumbnail = useCallback(() => {
    if (!thumbnail) return;
    const mime = thumbnail.split(";")[0].split(":")[1];
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const safeName = sanitizeFilename(videoName || "thumbnail");
    const link = document.createElement("a");
    link.href = thumbnail;
    link.download = `${safeName}_${formatTime(currentTime).replace(/[:.]/g, "-")}.${ext}`;
    link.click();
  }, [thumbnail, format, videoName, currentTime, sanitizeFilename]);

  useEffect(() => {
    const handler = (e) => {
      if (!videoSrc) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); stepFrame(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); stepFrame(1); }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); captureThumbnail(); }
      if (e.key === "s" && (e.ctrlKey || e.metaKey) && thumbnail) { e.preventDefault(); downloadThumbnail(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [videoSrc, stepFrame, captureThumbnail, downloadThumbnail, thumbnail]);

  useEffect(() => {
    return () => { if (videoSrc) URL.revokeObjectURL(videoSrc); };
  }, [videoSrc]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0b",
      color: "#e8e6e3",
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #161618; }
        ::-webkit-scrollbar-thumb { background: #2a2a2e; border-radius: 3px; }
        ::selection { background: #c4451033; color: #f0b8a0; }
      `}</style>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Header */}
      <header style={{
        padding: "20px 32px",
        borderBottom: "1px solid #1a1a1e",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#0d0d0e",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32,
            background: "linear-gradient(135deg, #c44510, #e8622a)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>▶</div>
          <h1 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em",
          }}>Thumbnail Extractor</h1>
        </div>
        {videoSrc && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {nativeSize && (
              <span style={{
                fontSize: 11, color: "#555",
                background: "#141416", padding: "4px 10px",
                borderRadius: 4, border: "1px solid #1e1e22",
              }}>{nativeSize.w}×{nativeSize.h}</span>
            )}
            <span style={{
              fontSize: 11, color: "#666",
              background: "#141416", padding: "4px 10px",
              borderRadius: 4, border: "1px solid #1e1e22",
              maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{videoName}</span>
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 24px 80px" }}>

        {!videoSrc ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              marginTop: 80,
              border: `2px dashed ${dragOver ? "#c44510" : "#2a2a2e"}`,
              borderRadius: 12, padding: "80px 40px", textAlign: "center",
              cursor: "pointer", transition: "all 0.2s ease",
              background: dragOver ? "#c445100a" : "#0d0d0e",
            }}
          >
            <input ref={fileInputRef} type="file" accept="video/*"
              onChange={handleFileInput} style={{ display: "none" }} />
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>◉</div>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 16, fontWeight: 500, color: "#999", marginBottom: 8,
            }}>Drop a video file here or click to browse</p>
            <p style={{ fontSize: 11, color: "#555" }}>
              MP4, WebM, MOV, AVI — any format your browser supports
            </p>
          </div>
        ) : (
          <>
            {/* Video */}
            <div style={{
              background: "#000", borderRadius: 10,
              overflow: "hidden", position: "relative",
            }}>
              <video
                ref={videoRef}
                src={videoSrc}
                onLoadedData={onLoadedData}
                onTimeUpdate={() => !isDragging && setCurrentTime(videoRef.current?.currentTime || 0)}
                style={{
                  width: "100%", maxHeight: 500, display: "block",
                  objectFit: "contain", background: "#000",
                }}
                preload="auto"
                muted
                playsInline
              />
              {!videoReady && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.7)",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#888",
                }}>Loading video…</div>
              )}
              {videoReady && (
                <div style={{
                  position: "absolute", bottom: 12, right: 12,
                  background: "rgba(0,0,0,0.8)", padding: "4px 10px",
                  borderRadius: 4, fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  backdropFilter: "blur(8px)", letterSpacing: "0.03em",
                }}>
                  <span style={{ color: "#c44510" }}>{formatTime(currentTime)}</span>
                  <span style={{ color: "#555" }}> / {formatTime(duration)}</span>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div style={{
              background: "#111113", borderRadius: "0 0 10px 10px",
              padding: "12px 16px 16px", marginBottom: 20,
            }}>
              {previewFrames.length > 0 && (
                <div style={{
                  display: "flex", gap: 2, marginBottom: 10,
                  borderRadius: 4, overflow: "hidden",
                }}>
                  {previewFrames.map((f, i) => (
                    <div key={i}
                      onClick={() => { videoRef.current && (videoRef.current.currentTime = f.time); setCurrentTime(f.time); }}
                      style={{
                        flex: 1, cursor: "pointer",
                        opacity: currentTime >= f.time &&
                          (i === previewFrames.length - 1 || currentTime < previewFrames[i + 1]?.time) ? 1 : 0.5,
                        transition: "opacity 0.15s",
                      }}
                    >
                      <img src={f.src} alt="" style={{ width: "100%", height: 50, objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
              )}
              {isGeneratingPreviews && (
                <div style={{ fontSize: 11, color: "#555", marginBottom: 8, textAlign: "center" }}>
                  Generating preview frames…
                </div>
              )}

              <div ref={timelineRef} onMouseDown={onTimelineMouseDown}
                style={{
                  height: 28, background: "#1a1a1e", borderRadius: 4,
                  cursor: "pointer", position: "relative", overflow: "hidden",
                }}>
                <div style={{
                  width: `${progressPercent}%`, height: "100%",
                  background: "linear-gradient(90deg, #c44510, #e8622a)",
                  borderRadius: 4, transition: isDragging ? "none" : "width 0.1s ease",
                }} />
                <div style={{
                  position: "absolute", top: 0, left: `${progressPercent}%`,
                  transform: "translateX(-50%)", width: 3, height: "100%",
                  background: "#fff", borderRadius: 2,
                  boxShadow: "0 0 6px rgba(196,69,16,0.6)",
                }} />
              </div>

              <div style={{
                display: "flex", justifyContent: "center",
                alignItems: "center", gap: 12, marginTop: 12,
              }}>
                <StepButton label="◁ Frame" onClick={() => stepFrame(-1)} />
                <button onClick={captureThumbnail} style={{
                  background: "linear-gradient(135deg, #c44510, #d4551a)",
                  color: "#fff", border: "none", borderRadius: 6,
                  padding: "8px 24px", fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                  cursor: "pointer", letterSpacing: "0.02em",
                }}>⬤ Capture Frame</button>
                <StepButton label="Frame ▷" onClick={() => stepFrame(1)} />
              </div>
              <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: "#444", letterSpacing: "0.04em" }}>
                ← → step frames &nbsp;·&nbsp; Enter/Space capture &nbsp;·&nbsp; Ctrl+S save
              </div>
            </div>

            {/* Settings */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <SettingCard label="Resolution">
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {allSizes.map((s) => (
                    <PillButton key={s.label} active={size?.label === s.label}
                      onClick={() => setSize(s)}>{s.label}</PillButton>
                  ))}
                </div>
              </SettingCard>
              <SettingCard label="Format">
                <div style={{ display: "flex", gap: 4 }}>
                  {FORMAT_OPTIONS.map((f) => (
                    <PillButton key={f} active={format === f}
                      onClick={() => setFormat(f)}>{FORMAT_LABELS[f]}</PillButton>
                  ))}
                </div>
              </SettingCard>
              {format !== "image/png" && (
                <SettingCard label={`Quality: ${Math.round(quality * 100)}%`}>
                  <input type="range" min={0.1} max={1} step={0.01} value={quality}
                    onChange={(e) => setQuality(parseFloat(e.target.value))}
                    style={{ width: "100%", accentColor: "#c44510", height: 4 }} />
                </SettingCard>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <button onClick={() => fileInputRef.current?.click()} style={{
                background: "transparent", color: "#666",
                border: "1px solid #222", borderRadius: 6,
                padding: "6px 14px", fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
              }}>↻ Load different video</button>
              <input ref={fileInputRef} type="file" accept="video/*"
                onChange={handleFileInput} style={{ display: "none" }} />
            </div>

            {/* Captured thumbnail */}
            {thumbnail && (
              <div style={{
                background: "#111113", borderRadius: 10,
                padding: 20, border: "1px solid #1e1e22",
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 14,
                }}>
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13, fontWeight: 600, color: "#aaa",
                  }}>Captured at {formatTime(currentTime)}</span>
                  <span style={{
                    fontSize: 10, color: "#555",
                    background: "#1a1a1e", padding: "3px 8px", borderRadius: 3,
                  }}>{size?.label} · {FORMAT_LABELS[format]}</span>
                </div>
                <img src={thumbnail} alt="Captured thumbnail" style={{
                  width: "100%", maxHeight: 400, objectFit: "contain",
                  borderRadius: 6, background: "#000", display: "block",
                }} />
                <button onClick={downloadThumbnail} style={{
                  width: "100%", marginTop: 14, padding: "10px 20px",
                  background: "linear-gradient(135deg, #c44510, #d4551a)",
                  color: "#fff", border: "none", borderRadius: 6,
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 600, cursor: "pointer", letterSpacing: "0.02em",
                }}>↓ Download Thumbnail</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StepButton({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "#1a1a1e", color: "#999",
      border: "1px solid #2a2a2e", borderRadius: 5,
      padding: "6px 14px", fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      cursor: "pointer", transition: "all 0.15s",
    }}>{label}</button>
  );
}

function SettingCard({ label, children }) {
  return (
    <div style={{
      flex: "1 1 200px", background: "#111113",
      borderRadius: 8, padding: "12px 14px", border: "1px solid #1e1e22",
    }}>
      <div style={{
        fontSize: 10, color: "#666", marginBottom: 8,
        textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500,
      }}>{label}</div>
      {children}
    </div>
  );
}

function PillButton({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "#c44510" : "#1a1a1e",
      color: active ? "#fff" : "#888",
      border: active ? "1px solid #c44510" : "1px solid #2a2a2e",
      borderRadius: 4, padding: "4px 10px", fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      cursor: "pointer", transition: "all 0.15s",
      fontWeight: active ? 500 : 400,
    }}>{children}</button>
  );
}
