# Julias Arm in Windows: ein dauerhaft laufender PowerShell-Prozess, der
# Skripte zeilenweise als JSON entgegennimmt ({id, skript(base64)}) und das
# Ergebnis als eine JSON-Zeile zurückgibt ({id, ok, daten, fehler}).

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class JuliaWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr eltern, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int index);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);

  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }

  const uint KEYUP = 2, UNICODE = 4, EXTENDED = 1;

  static INPUT Key(ushort vk, ushort scan, uint flags) {
    var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i;
  }
  static INPUT Mouse(uint flags) {
    var i = new INPUT(); i.type = 0; i.u.mi.dwFlags = flags; return i;
  }
  static void Send(List<INPUT> l) {
    var a = l.ToArray();
    SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT)));
  }
  static bool Extended(ushort v) { return (v >= 0x21 && v <= 0x2E) || v == 0x5B || v == 0x5C || v == 0x5D; }

  public static void Tippen(string text) {
    foreach (char c in text) {
      if (c == '\r') continue;
      var l = new List<INPUT>();
      if (c == '\n') { l.Add(Key(0x0D, 0, 0)); l.Add(Key(0x0D, 0, KEYUP)); }
      else if (c == '\t') { l.Add(Key(0x09, 0, 0)); l.Add(Key(0x09, 0, KEYUP)); }
      else { l.Add(Key(0, c, UNICODE)); l.Add(Key(0, c, UNICODE | KEYUP)); }
      Send(l);
      Thread.Sleep(4);
    }
  }

  public static void Kombination(ushort[] vks) {
    var l = new List<INPUT>();
    foreach (var v in vks) l.Add(Key(v, 0, Extended(v) ? EXTENDED : 0));
    for (int i = vks.Length - 1; i >= 0; i--) l.Add(Key(vks[i], 0, KEYUP | (Extended(vks[i]) ? EXTENDED : 0)));
    Send(l);
  }

  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);

  // Hotkey "markierter Text": erst warten, bis Alt, Umschalt und die
  // Windows-Taste losgelassen sind (höchstens 1,5 s) – sonst käme Strg+Alt+C an.
  public static void KopierenNachHotkey() {
    int[] tasten = { 0x12, 0x10, 0x5B, 0x5C };
    var ende = DateTime.Now.AddMilliseconds(1500);
    while (DateTime.Now < ende) {
      bool gedrueckt = false;
      foreach (var t in tasten) if ((GetAsyncKeyState(t) & 0x8000) != 0) gedrueckt = true;
      if (!gedrueckt) break;
      Thread.Sleep(20);
    }
    Kombination(new ushort[] { 0x11, 0x43 });
  }

  public static void Klick(int x, int y, string taste, bool doppelt) {
    SetCursorPos(x, y);
    Thread.Sleep(40);
    uint down = 0x0002, up = 0x0004;
    if (taste == "rechts") { down = 0x0008; up = 0x0010; }
    else if (taste == "mitte") { down = 0x0020; up = 0x0040; }
    int n = doppelt ? 2 : 1;
    for (int i = 0; i < n; i++) {
      Send(new List<INPUT> { Mouse(down), Mouse(up) });
      Thread.Sleep(70);
    }
  }

  public static void Scrollen(int x, int y, int schritte) {
    SetCursorPos(x, y);
    Thread.Sleep(30);
    var i = Mouse(0x0800);
    i.u.mi.mouseData = unchecked((uint)(schritte * 120));
    Send(new List<INPUT> { i });
  }

  public static List<string> Fenster() {
    var r = new List<string>();
    IntPtr vorne = GetForegroundWindow();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;
      int cloaked = 0;
      DwmGetWindowAttribute(h, 14, out cloaked, 4);
      if (cloaked != 0) return true;
      int len = GetWindowTextLength(h);
      if (len == 0) return true;
      var sb = new StringBuilder(len + 1);
      GetWindowText(h, sb, sb.Capacity);
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      r.Add(h.ToInt64() + "\t" + pid + "\t" + (IsIconic(h) ? 1 : 0) + "\t" + (h == vorne ? 1 : 0) + "\t" + sb.ToString());
      return true;
    }, IntPtr.Zero);
    return r;
  }

  public static string Vordergrund() {
    IntPtr h = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    var t = new StringBuilder(512); GetWindowText(h, t, t.Capacity);
    var k = new StringBuilder(256); GetClassName(h, k, k.Capacity);
    return pid + "\t" + k.ToString() + "\t" + t.ToString();
  }

  // Klassische Windows-Eingabefelder mit ES_PASSWORD (0x20). UI Automation meldet
  // z. B. Windows-Forms-Felder nur als "Pane" ohne Passwort-Kennzeichen, das
  // Stilbit ist dagegen verlässlich. Es gilt nur für Edit-Klassen.
  public static List<string> PasswortFelderWin32(IntPtr eltern) {
    var r = new List<string>();
    EnumChildWindows(eltern, delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      var k = new StringBuilder(256);
      GetClassName(h, k, k.Capacity);
      if (k.ToString().IndexOf("EDIT", StringComparison.OrdinalIgnoreCase) < 0) return true;
      if ((GetWindowLong(h, -16) & 0x20) == 0) return true;
      RECT rc;
      if (GetWindowRect(h, out rc) && rc.R > rc.L && rc.B > rc.T) r.Add(rc.L + "\t" + rc.T + "\t" + (rc.R - rc.L) + "\t" + (rc.B - rc.T));
      return true;
    }, IntPtr.Zero);
    return r;
  }

  public static string FensterRechteck(IntPtr h) {
    RECT rc;
    return GetWindowRect(h, out rc) ? (rc.L + "\t" + rc.T + "\t" + (rc.R - rc.L) + "\t" + (rc.B - rc.T)) : "";
  }

  public static bool Fokus(long id) {
    var h = new IntPtr(id);
    if (IsIconic(h)) ShowWindow(h, 9);
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    return SetForegroundWindow(h);
  }
}
'@

[void][JuliaWin]::SetProcessDPIAware()

while ($true) {
  $zeile = [Console]::In.ReadLine()
  if ($null -eq $zeile) { break }
  $antwort = @{ id = $null; ok = $true; daten = $null; fehler = $null }
  try {
    $anfrage = $zeile | ConvertFrom-Json
    $antwort.id = $anfrage.id
    $code = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($anfrage.skript))
    $antwort.daten = & ([scriptblock]::Create($code))
  } catch {
    $antwort.ok = $false
    $antwort.fehler = $_.Exception.Message
  }
  [Console]::Out.WriteLine(($antwort | ConvertTo-Json -Depth 8 -Compress))
  [Console]::Out.Flush()
}
