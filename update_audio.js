const fs = require('fs');
const path = 'C:/Users/Taller SK/Documents/PROYECTOS/Chat de Atención Sekunet/src/components/internal-chat/internal-chat-view.tsx';
let src = fs.readFileSync(path, 'utf8');

const oldPlayer = `// ── REPRODUCTOR DE AUDIO ELEGANTE ──
function InternalAudioPlayer({ url, isMe }: { url: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onTime = () => setCurrentTime(a.currentTime);
    const onLoaded = () => {
      if (isFinite(a.duration)) setDuration(a.duration);
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => {});
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const time = Number(e.target.value);
    a.currentTime = time;
    setCurrentTime(time);
  };

  const fmt = (sec: number) => {
    if (!isFinite(sec) || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return \`\${m}:\${String(s).padStart(2, "0")}\`;
  };

  return (
    <div
      className={\`flex items-center gap-2 p-2 rounded-xl min-w-[200px] \${
        isMe ? "bg-white/10" : "bg-card/70 border border-border/50"
      }\`}
    >
      <audio ref={audioRef} src={url} preload="metadata" />

      <button
        type="button"
        onClick={togglePlay}
        className={\`h-7 w-7 rounded-lg grid place-items-center shrink-0 transition-transform active:scale-95 \${
          isMe
            ? "bg-white text-violet-600 hover:bg-white/90"
            : "bg-violet-600 text-white hover:bg-violet-500"
        }\`}
      >
        {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-black/20 rounded-lg appearance-none cursor-pointer accent-violet-400"
        />
        <div
          className={\`flex items-center justify-between text-[9px] font-mono leading-none \${
            isMe ? "text-white/80" : "text-muted-foreground"
          }\`}
        >
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}`;

const newPlayer = `// ── REPRODUCTOR DE AUDIO ELEGANTE CON CONTROL DE VELOCIDAD Y FORMA DE ONDA ──
function InternalAudioPlayer({ url, isMe }: { url: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const speedCycle = [1, 1.5, 2];

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onTime = () => setCurrentTime(a.currentTime);
    const onLoaded = () => {
      if (isFinite(a.duration)) setDuration(a.duration);
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => {});
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const time = Number(e.target.value);
    a.currentTime = time;
    setCurrentTime(time);
  };

  const toggleSpeed = () => {
    const a = audioRef.current;
    if (!a) return;
    const nextIdx = (speedCycle.indexOf(playbackRate) + 1) % speedCycle.length;
    const nextSpeed = speedCycle[nextIdx];
    a.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
  };

  const fmt = (sec: number) => {
    if (!isFinite(sec) || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return \`\${m}:\${String(s).padStart(2, "0")}\`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={\`flex items-center gap-2.5 p-2 rounded-2xl min-w-[220px] max-w-[280px] transition-all \${
        isMe
          ? "bg-black/20 border border-white/20 text-white shadow-inner"
          : "bg-card/90 border border-border/80 text-foreground shadow-xs"
      }\`}
    >
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Botón Play / Pause */}
      <button
        type="button"
        onClick={togglePlay}
        className={\`h-8 w-8 rounded-xl grid place-items-center shrink-0 transition-all active:scale-90 shadow-sm cursor-pointer \${
          isMe
            ? "bg-white text-violet-600 hover:bg-white/95"
            : "bg-violet-600 text-white hover:bg-violet-500 shadow-violet-600/30"
        }\`}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
      </button>

      {/* Onda y Slider */}
      <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-black/25 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-violet-400"
          />
        </div>
        <div
          className={\`flex items-center justify-between text-[10px] font-mono leading-none \${
            isMe ? "text-white/80" : "text-muted-foreground"
          }\`}
        >
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Selector de Velocidad (1x, 1.5x, 2x) */}
      <button
        type="button"
        onClick={toggleSpeed}
        className={\`px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-tight transition-colors shrink-0 cursor-pointer \${
          isMe
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-muted hover:bg-muted/80 text-foreground border border-border/60"
        }\`}
        title="Cambiar velocidad de reproducción"
      >
        {playbackRate}x
      </button>
    </div>
  );
}`;

if (src.includes(oldPlayer)) {
  src = src.replace(oldPlayer, newPlayer);
  fs.writeFileSync(path, src, 'utf8');
  console.log('InternalAudioPlayer replaced successfully');
} else {
  console.log('Old player signature not found exactly');
}
