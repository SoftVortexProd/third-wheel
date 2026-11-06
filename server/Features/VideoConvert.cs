using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using static Core;

/// <summary>
/// Converts uploaded videos to WebM (VP9 + Opus) in the background, so they play in every client (the desktop app's browser can't decode H.264).
/// Needs ffmpeg next to the server (ffmpeg\ffmpeg.exe), or TW_FFMPEG pointing at it, or ffmpeg on the PATH. Without it uploads just stay as they were.
/// One video at a time, at low priority, with a time limit; the original is deleted once the WebM is ready.
/// </summary>
public static class VideoConvert
{
    static readonly Channel<long> Queue = Channel.CreateUnbounded<long>();
    static string? ffmpeg;
    static bool started;
    static readonly TimeSpan Limit = TimeSpan.FromMinutes(15);

    /// <summary>Raised after a file's state changes, so chats can refresh the message holding it.</summary>
    public static event Action<long>? Changed;

    public static string? FindFfmpeg()
    {
        var env = Environment.GetEnvironmentVariable("TW_FFMPEG");
        var candidates = new List<string?> { env, Path.Combine(AppContext.BaseDirectory, "ffmpeg", "ffmpeg.exe"), Path.Combine(AppContext.BaseDirectory, "ffmpeg.exe") };
        foreach (var c in candidates) if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            try { var f = Path.Combine(dir.Trim('"'), OperatingSystem.IsWindows() ? "ffmpeg.exe" : "ffmpeg"); if (File.Exists(f)) return f; } catch { /* bad PATH entry */ }
        }
        return null;
    }

    public static bool Available => ffmpeg != null;

    public static void Start()
    {
        if (started) return; started = true;
        ffmpeg = FindFfmpeg();
        if (ffmpeg == null) { Console.WriteLine("ffmpeg not found: uploaded videos will not be converted."); return; }
        Console.WriteLine("ffmpeg found: " + ffmpeg);
        // pick up anything that was waiting when the server last stopped
        foreach (var r in Db.Rows("SELECT id FROM files WHERE conv='pending' AND deletedAt IS NULL ORDER BY id")) Queue.Writer.TryWrite((long)r["id"]!);
        _ = Task.Run(Worker);
    }

    /// <summary>Queue a freshly uploaded video. Marks it "pending" so chats show "processing…" until it is ready.</summary>
    public static void Enqueue(long fileId)
    {
        if (ffmpeg == null) return;
        Db.Exec("UPDATE files SET conv='pending' WHERE id=@i", ("@i", fileId));
        Queue.Writer.TryWrite(fileId);
    }

    static async Task Worker()
    {
        await foreach (var id in Queue.Reader.ReadAllAsync())
        {
            try { await Convert1(id); }
            catch (Exception ex) { Console.WriteLine($"video {id}: {ex.Message}"); Finish(id, null, "failed"); }
        }
    }

    static async Task<(int code, string err)> Run(string args, TimeSpan limit)
    {
        var psi = new ProcessStartInfo(ffmpeg!, args) { RedirectStandardError = true, RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
        using var p = Process.Start(psi)!;
        try { p.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { /* not allowed: fine */ }
        var err = p.StandardError.ReadToEndAsync(); var outp = p.StandardOutput.ReadToEndAsync();
        using var cts = new CancellationTokenSource(limit);
        try { await p.WaitForExitAsync(cts.Token); }
        catch (OperationCanceledException) { try { p.Kill(true); } catch { /* gone */ } return (-1, "timed out"); }
        await outp;
        return (p.ExitCode, await err);
    }

    static async Task Convert1(long id)
    {
        var f = Db.Row("SELECT * FROM files WHERE id=@i AND deletedAt IS NULL", ("@i", id));
        if (f == null || f["conv"] as string != "pending") return;
        var src = (string)f["path"]!;
        if (!File.Exists(src)) { Finish(id, null, "failed"); return; }

        // what is inside? (ffmpeg prints the streams on stderr and exits non-zero because no output is given: that's expected)
        var (_, info) = await Run($"-hide_banner -nostdin -i \"{src}\"", TimeSpan.FromSeconds(30));
        var v = Regex.Match(info, @"Stream #\d+:\d+.*?: Video: (\w+)");
        if (!v.Success) { Finish(id, null, "failed"); return; }
        var webmInput = Regex.IsMatch(info, @"Input #0, (matroska,)?webm");
        var ts = f["trimStart"] is double a0 ? a0 : (double?)null; var te = f["trimEnd"] is double b0 ? b0 : (double?)null;
        var trim = ts.HasValue && te.HasValue ? string.Format(System.Globalization.CultureInfo.InvariantCulture, "-ss {0:0.###} -to {1:0.###} ", ts.Value, te.Value) : "";
        var vcodec = v.Groups[1].Value.ToLowerInvariant();
        var acodec = Regex.Match(info, @"Stream #\d+:\d+.*?: Audio: (\w+)") is { Success: true } a ? a.Groups[1].Value.ToLowerInvariant() : "";
        if (trim == "" && webmInput && vcodec is "vp8" or "vp9" or "av1" && acodec is "" or "opus" or "vorbis") { Finish(id, null, "done"); return; }   // already plays everywhere

        var dst = src + ".webm";
        var args = $"-hide_banner -nostdin -y {trim}-i \"{src}\" -map 0:v:0 -map 0:a:0? -c:v libvpx-vp9 -b:v 0 -crf 34 -deadline realtime -cpu-used 6 -row-mt 1 -threads 2 " +
                   "-vf \"scale='min(1280,iw)':-2\" -pix_fmt yuv420p -c:a libopus -b:a 96k -ac 2 -f webm \"" + dst + "\"";
        var (code, err) = await Run(args, Limit);
        if (code != 0 || !File.Exists(dst) || new FileInfo(dst).Length == 0)
        {
            try { File.Delete(dst); } catch { /* ignore */ }
            Console.WriteLine($"video {id}: ffmpeg failed ({code}) {err[^Math.Min(err.Length, 300)..]}");
            Finish(id, null, "failed"); return;
        }
        Finish(id, dst, "done");
        try { File.Delete(src); } catch { /* the original is no longer needed; disk cleanup is best effort */ }
    }

    static void Finish(long id, string? newPath, string state)
    {
        if (newPath != null)
        {
            var old = Db.Row("SELECT name FROM files WHERE id=@i", ("@i", id));
            var name = Path.GetFileNameWithoutExtension((string)(old?["name"] ?? "video")) + ".webm";
            Db.Exec("UPDATE files SET path=@p, mime='video/webm', size=@s, name=@n, conv=@c WHERE id=@i", ("@p", newPath), ("@s", new FileInfo(newPath).Length), ("@n", name), ("@c", state), ("@i", id));
        }
        else Db.Exec("UPDATE files SET conv=@c WHERE id=@i", ("@c", state), ("@i", id));
        Changed?.Invoke(id);
    }
}
