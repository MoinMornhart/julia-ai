package __PACKAGE__

// Julias Handy-Steuerung „über Elemente" (Issue #6) – ein AccessibilityService.
// Liest den UI-Baum als flache Elementliste (Text/Id/Bounds/Flags) und kann
// Gesten/Aktionen ausführen. Ohne Root, ohne Shizuku, ohne dauerhafte Screenshots.
// Eigene, frische Umsetzung (kein übernommener Fremdcode). Der Dienst wird vom
// Nutzer bewusst in den Android-Bedienungshilfen freigeschaltet.

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

class JuliaAccessibilityService : AccessibilityService() {

    private val eigenesPaket = "__PACKAGE__"

    companion object {
        @Volatile
        var instanz: JuliaAccessibilityService? = null
            private set

        fun laeuft(): Boolean = instanz != null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instanz = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        instanz = null
    }

    // ─── Bildschirm als Elementliste lesen ──────────────────────────

    /** Aktuellen Bildschirm als JSON-Array von Elementen zurückgeben. */
    fun bildschirmLesen(): String {
        val liste = JSONArray()
        val fenster = windows
        if (fenster.isNullOrEmpty()) {
            val wurzel = rootInActiveWindow ?: return liste.toString()
            durchlaufen(wurzel, liste, 0)
            wurzel.recycle()
            return liste.toString()
        }
        for (w in fenster) {
            val wurzel = w.root ?: continue
            if (wurzel.packageName?.toString() != eigenesPaket) durchlaufen(wurzel, liste, 0)
            wurzel.recycle()
        }
        return liste.toString()
    }

    private fun durchlaufen(node: AccessibilityNodeInfo, aus: JSONArray, tiefe: Int) {
        val r = Rect()
        node.getBoundsInScreen(r)
        val text = node.text?.toString() ?: ""
        val beschr = node.contentDescription?.toString() ?: ""
        val leer = r.width() <= 0 || r.height() <= 0
        if (node.isVisibleToUser && !leer &&
            (text.isNotEmpty() || beschr.isNotEmpty() || node.isClickable || node.isEditable || node.isScrollable)
        ) {
            val e = JSONObject()
            e.put("i", aus.length())
            e.put("text", text)
            e.put("desc", beschr)
            e.put("klasse", (node.className?.toString() ?: "").substringAfterLast('.'))
            e.put("id", node.viewIdResourceName ?: "")
            e.put("clickable", node.isClickable)
            e.put("editable", node.isEditable)
            e.put("scrollable", node.isScrollable)
            e.put("x", r.centerX())
            e.put("y", r.centerY())
            e.put("tiefe", tiefe)
            aus.put(e)
        }
        for (i in 0 until node.childCount) {
            val kind = node.getChild(i) ?: continue
            durchlaufen(kind, aus, tiefe + 1)
            kind.recycle()
        }
    }

    // ─── Aktionen ───────────────────────────────────────────────────

    /** Einen Knoten mit passendem Text finden und klicken (sonst auf Koordinaten). */
    fun klickText(ziel: String): Boolean {
        for (w in windows) {
            val wurzel = w.root ?: continue
            if (wurzel.packageName?.toString() == eigenesPaket) { wurzel.recycle(); continue }
            val ok = findenUndKlicken(wurzel, ziel)
            wurzel.recycle()
            if (ok) return true
        }
        return false
    }

    private fun findenUndKlicken(node: AccessibilityNodeInfo, ziel: String): Boolean {
        val text = node.text?.toString() ?: ""
        val desc = node.contentDescription?.toString() ?: ""
        if ((text.contains(ziel, true) || desc.contains(ziel, true)) && klickKnotenOderEltern(node)) return true
        for (i in 0 until node.childCount) {
            val kind = node.getChild(i) ?: continue
            if (findenUndKlicken(kind, ziel)) { kind.recycle(); return true }
            kind.recycle()
        }
        return false
    }

    private fun klickKnotenOderEltern(node: AccessibilityNodeInfo): Boolean {
        var ziel: AccessibilityNodeInfo? = node
        while (ziel != null && !ziel.isClickable) ziel = ziel.parent
        if (ziel?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
        val r = Rect()
        node.getBoundsInScreen(r)
        return !r.isEmpty && klickKoordinaten(r.centerX().toFloat(), r.centerY().toFloat())
    }

    fun klickKoordinaten(x: Float, y: Float): Boolean {
        val pfad = Path().apply { moveTo(x, y) }
        val geste = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(pfad, 0, 80))
            .build()
        return dispatchGesture(geste, null, null)
    }

    fun textEingeben(text: String): Boolean {
        for (w in windows) {
            val wurzel = w.root ?: continue
            val feld = ersteEditierbare(wurzel)
            if (feld != null) {
                feld.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                }
                val ok = feld.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                wurzel.recycle()
                return ok
            }
            wurzel.recycle()
        }
        return false
    }

    private fun ersteEditierbare(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isEditable) return node
        for (i in 0 until node.childCount) {
            val kind = node.getChild(i) ?: continue
            val gefunden = ersteEditierbare(kind)
            if (gefunden != null) return gefunden
            kind.recycle()
        }
        return null
    }

    fun scrollen(vorwaerts: Boolean): Boolean {
        for (w in windows) {
            val wurzel = w.root ?: continue
            val s = ersteScrollbare(wurzel)
            if (s != null) {
                val a = if (vorwaerts) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                val ok = s.performAction(a)
                wurzel.recycle()
                return ok
            }
            wurzel.recycle()
        }
        return false
    }

    private fun ersteScrollbare(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) {
            val kind = node.getChild(i) ?: continue
            val gefunden = ersteScrollbare(kind)
            if (gefunden != null) return gefunden
            kind.recycle()
        }
        return null
    }

    fun wischen(x1: Float, y1: Float, x2: Float, y2: Float, dauer: Long = 300): Boolean {
        val pfad = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        val geste = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(pfad, 0, dauer))
            .build()
        return dispatchGesture(geste, null, null)
    }

    fun zurueck(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)
    fun startseite(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)
    fun letzteApps(): Boolean = performGlobalAction(GLOBAL_ACTION_RECENTS)
    fun benachrichtigungen(): Boolean = performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
}
