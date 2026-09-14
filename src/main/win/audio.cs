// Audio-Geräte für Julias Sprache: Mikrofon und Lautsprecher frei wählbar.
// Die Windows-Spracherkennung (System.Speech) kennt von sich aus nur das
// Standardgerät. JuliaMikrofon liest ein bestimmtes Mikrofon über WinMM ein
// und reicht es als Datenstrom weiter; JuliaLautsprecher spielt die
// gesprochene Antwort auf einem bestimmten Ausgabegerät ab.
// C# 5 (Windows PowerShell 5.1 kompiliert damit) – keine neueren Sprachmittel.

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public static class JuliaAudioGeraete {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct WAVEINCAPS { public ushort wMid; public ushort wPid; public uint vDriverVersion; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szPname; public uint dwFormats; public ushort wChannels; public ushort wReserved1; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct WAVEOUTCAPS { public ushort wMid; public ushort wPid; public uint vDriverVersion; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szPname; public uint dwFormats; public ushort wChannels; public ushort wReserved1; public uint dwSupport; }

  [DllImport("winmm.dll")] static extern uint waveInGetNumDevs();
  [DllImport("winmm.dll", CharSet = CharSet.Unicode)] static extern uint waveInGetDevCaps(UIntPtr id, ref WAVEINCAPS caps, uint size);
  [DllImport("winmm.dll")] static extern uint waveOutGetNumDevs();
  [DllImport("winmm.dll", CharSet = CharSet.Unicode)] static extern uint waveOutGetDevCaps(UIntPtr id, ref WAVEOUTCAPS caps, uint size);

  public static string[] Eingaenge() {
    var l = new List<string>();
    uint n = waveInGetNumDevs();
    for (uint i = 0; i < n; i++) {
      var c = new WAVEINCAPS();
      if (waveInGetDevCaps(new UIntPtr(i), ref c, (uint)Marshal.SizeOf(typeof(WAVEINCAPS))) == 0) l.Add(c.szPname);
    }
    return l.ToArray();
  }

  public static string[] Ausgaenge() {
    var l = new List<string>();
    uint n = waveOutGetNumDevs();
    for (uint i = 0; i < n; i++) {
      var c = new WAVEOUTCAPS();
      if (waveOutGetDevCaps(new UIntPtr(i), ref c, (uint)Marshal.SizeOf(typeof(WAVEOUTCAPS))) == 0) l.Add(c.szPname);
    }
    return l.ToArray();
  }

  public static int EingangNr(string name) { return Array.IndexOf(Eingaenge(), name); }
  public static int AusgangNr(string name) { return Array.IndexOf(Ausgaenge(), name); }
}

[StructLayout(LayoutKind.Sequential)]
public struct JuliaWaveFormat { public ushort wFormatTag; public ushort nChannels; public uint nSamplesPerSec; public uint nAvgBytesPerSec; public ushort nBlockAlign; public ushort wBitsPerSample; public ushort cbSize; }

[StructLayout(LayoutKind.Sequential)]
public struct JuliaWaveHdr { public IntPtr lpData; public uint dwBufferLength; public uint dwBytesRecorded; public IntPtr dwUser; public uint dwFlags; public uint dwLoops; public IntPtr lpNext; public IntPtr reserved; }

// Ein bestimmtes Mikrofon als endloser Datenstrom (16 kHz, 16 Bit, mono).
public class JuliaMikrofon : Stream {
  [DllImport("winmm.dll")] static extern uint waveInOpen(out IntPtr h, UIntPtr dev, ref JuliaWaveFormat fmt, IntPtr cb, IntPtr inst, uint flags);
  [DllImport("winmm.dll")] static extern uint waveInPrepareHeader(IntPtr h, IntPtr hdr, uint size);
  [DllImport("winmm.dll")] static extern uint waveInUnprepareHeader(IntPtr h, IntPtr hdr, uint size);
  [DllImport("winmm.dll")] static extern uint waveInAddBuffer(IntPtr h, IntPtr hdr, uint size);
  [DllImport("winmm.dll")] static extern uint waveInStart(IntPtr h);
  [DllImport("winmm.dll")] static extern uint waveInReset(IntPtr h);
  [DllImport("winmm.dll")] static extern uint waveInClose(IntPtr h);

  const int PUFFER = 3200; // 100 ms
  const uint FERTIG = 1;
  IntPtr geraet;
  IntPtr[] koepfe = new IntPtr[8];
  IntPtr[] speicher = new IntPtr[8];
  BlockingCollection<byte[]> schlange = new BlockingCollection<byte[]>(600);
  byte[] rest;
  int restPos;
  long gelesen;
  volatile bool laeuft = true;
  Thread faden;

  public JuliaMikrofon(int nr) {
    var f = new JuliaWaveFormat();
    f.wFormatTag = 1; f.nChannels = 1; f.nSamplesPerSec = 16000; f.wBitsPerSample = 16; f.nBlockAlign = 2; f.nAvgBytesPerSec = 32000; f.cbSize = 0;
    uint r = waveInOpen(out geraet, new UIntPtr(unchecked((uint)nr)), ref f, IntPtr.Zero, IntPtr.Zero, 0);
    if (r != 0) throw new IOException("Mikrofon lässt sich nicht öffnen (" + r + ").");
    uint groesse = (uint)Marshal.SizeOf(typeof(JuliaWaveHdr));
    for (int i = 0; i < koepfe.Length; i++) {
      speicher[i] = Marshal.AllocHGlobal(PUFFER);
      var k = new JuliaWaveHdr();
      k.lpData = speicher[i];
      k.dwBufferLength = PUFFER;
      koepfe[i] = Marshal.AllocHGlobal((int)groesse);
      Marshal.StructureToPtr(k, koepfe[i], false);
      waveInPrepareHeader(geraet, koepfe[i], groesse);
      waveInAddBuffer(geraet, koepfe[i], groesse);
    }
    waveInStart(geraet);
    faden = new Thread(Schleife);
    faden.IsBackground = true;
    faden.Start();
  }

  void Schleife() {
    uint groesse = (uint)Marshal.SizeOf(typeof(JuliaWaveHdr));
    int i = 0;
    while (laeuft) {
      var k = (JuliaWaveHdr)Marshal.PtrToStructure(koepfe[i], typeof(JuliaWaveHdr));
      if ((k.dwFlags & FERTIG) == 0) { Thread.Sleep(8); continue; }
      if (k.dwBytesRecorded > 0) {
        var b = new byte[k.dwBytesRecorded];
        Marshal.Copy(k.lpData, b, 0, b.Length);
        schlange.TryAdd(b);
      }
      waveInUnprepareHeader(geraet, koepfe[i], groesse);
      k.dwFlags = 0;
      k.dwBytesRecorded = 0;
      Marshal.StructureToPtr(k, koepfe[i], false);
      if (!laeuft) break;
      waveInPrepareHeader(geraet, koepfe[i], groesse);
      waveInAddBuffer(geraet, koepfe[i], groesse);
      i = (i + 1) % koepfe.Length;
    }
  }

  // Immer so viel liefern, wie verlangt: Die Windows-Spracherkennung hält eine
  // kürzere Antwort für das Ende des Datenstroms und hört dann nicht mehr zu.
  public override int Read(byte[] ziel, int versatz, int anzahl) {
    int n = 0;
    while (n < anzahl) {
      if (rest == null || restPos >= rest.Length) {
        byte[] b;
        if (!schlange.TryTake(out b, 30000)) break; // 30 s gar kein Ton: Mikrofon hängt
        rest = b;
        restPos = 0;
      }
      int k = Math.Min(anzahl - n, rest.Length - restPos);
      Buffer.BlockCopy(rest, restPos, ziel, versatz + n, k);
      restPos += k;
      n += k;
    }
    gelesen += n;
    return n;
  }

  public override bool CanRead { get { return true; } }
  public override bool CanSeek { get { return false; } }
  public override bool CanWrite { get { return false; } }
  public override long Length { get { return long.MaxValue; } }
  public override long Position { get { return gelesen; } set { } }
  public override void Flush() { }
  public override long Seek(long o, SeekOrigin s) { throw new NotSupportedException(); }
  public override void SetLength(long v) { throw new NotSupportedException(); }
  public override void Write(byte[] b, int o, int n) { throw new NotSupportedException(); }

  protected override void Dispose(bool entsorgen) {
    if (laeuft) {
      laeuft = false;
      waveInReset(geraet);
      waveInClose(geraet);
    }
    base.Dispose(entsorgen);
  }
}

// Spielt eine WAV-Datei (aus dem Speicher) auf einem bestimmten Ausgabegerät ab.
public static class JuliaLautsprecher {
  [DllImport("winmm.dll")] static extern uint waveOutOpen(out IntPtr h, UIntPtr dev, ref JuliaWaveFormat fmt, IntPtr cb, IntPtr inst, uint flags);
  [DllImport("winmm.dll")] static extern uint waveOutPrepareHeader(IntPtr h, IntPtr hdr, uint size);
  [DllImport("winmm.dll")] static extern uint waveOutUnprepareHeader(IntPtr h, IntPtr hdr, uint size);
  [DllImport("winmm.dll")] static extern uint waveOutWrite(IntPtr h, IntPtr hdr, uint size);
  [DllImport("winmm.dll")] static extern uint waveOutClose(IntPtr h);

  public static void Abspielen(byte[] wav, int nr) {
    int fmt = -1, daten = -1, datenLaenge = 0;
    for (int p = 12; p + 8 <= wav.Length; ) {
      string id = System.Text.Encoding.ASCII.GetString(wav, p, 4);
      int laenge = BitConverter.ToInt32(wav, p + 4);
      if (id == "fmt ") fmt = p + 8;
      if (id == "data") { daten = p + 8; datenLaenge = Math.Min(laenge, wav.Length - daten); break; }
      p += 8 + laenge + (laenge % 2);
    }
    if (fmt < 0 || daten < 0) throw new IOException("Keine gültige WAV-Datei.");
    var f = new JuliaWaveFormat();
    f.wFormatTag = BitConverter.ToUInt16(wav, fmt);
    f.nChannels = BitConverter.ToUInt16(wav, fmt + 2);
    f.nSamplesPerSec = BitConverter.ToUInt32(wav, fmt + 4);
    f.nAvgBytesPerSec = BitConverter.ToUInt32(wav, fmt + 8);
    f.nBlockAlign = BitConverter.ToUInt16(wav, fmt + 12);
    f.wBitsPerSample = BitConverter.ToUInt16(wav, fmt + 14);
    f.cbSize = 0;
    IntPtr h;
    uint r = waveOutOpen(out h, new UIntPtr(unchecked((uint)nr)), ref f, IntPtr.Zero, IntPtr.Zero, 0);
    if (r != 0) throw new IOException("Lautsprecher lässt sich nicht öffnen (" + r + ").");
    IntPtr puffer = Marshal.AllocHGlobal(datenLaenge);
    Marshal.Copy(wav, daten, puffer, datenLaenge);
    var k = new JuliaWaveHdr();
    k.lpData = puffer;
    k.dwBufferLength = (uint)datenLaenge;
    uint groesse = (uint)Marshal.SizeOf(typeof(JuliaWaveHdr));
    IntPtr kopf = Marshal.AllocHGlobal((int)groesse);
    Marshal.StructureToPtr(k, kopf, false);
    waveOutPrepareHeader(h, kopf, groesse);
    waveOutWrite(h, kopf, groesse);
    while (true) {
      var s = (JuliaWaveHdr)Marshal.PtrToStructure(kopf, typeof(JuliaWaveHdr));
      if ((s.dwFlags & 1) != 0) break;
      Thread.Sleep(20);
    }
    waveOutUnprepareHeader(h, kopf, groesse);
    waveOutClose(h);
    Marshal.FreeHGlobal(kopf);
    Marshal.FreeHGlobal(puffer);
  }
}
