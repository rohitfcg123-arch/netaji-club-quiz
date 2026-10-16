package org.netajiclub.trust

import android.content.Intent
import android.graphics.Canvas
import android.graphics.BitmapFactory
import android.graphics.Path
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.CountDownTimer
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.content.Context
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.ceil

class MainActivity : AppCompatActivity() {
    private val navy = 0xFF102F5D.toInt()
    private val navy2 = 0xFF09224A.toInt()
    private val saffron = 0xFFF26A21.toInt()
    private val gold = 0xFFF1BE48.toInt()
    private val green = 0xFF238548.toInt()
    private val ink = 0xFF203047.toInt()
    private val muted = 0xFF64748B.toInt()
    private val cream = 0xFFFFF8E8.toInt()
    private val paper = 0xFFFFFFFF.toInt()
    private val paleBlue = 0xFFEAF3FF.toInt()
    private val paleOrange = 0xFFFFF0E4.toInt()
    private val paleGreen = 0xFFEAF7ED.toInt()
    private val red = 0xFFBD3044.toInt()

    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore
    private lateinit var googleClient: GoogleSignInClient
    private lateinit var root: LinearLayout
    private lateinit var content: LinearLayout
    private lateinit var scroller: ScrollView
    private lateinit var bottomBar: LinearLayout
    private lateinit var refreshIndicator: TextView
    private var pullTracking = false
    private var pullStartY = 0f
    private var pullDistance = 0f
    private var refreshInProgress = false
    private val imageLoader = Executors.newFixedThreadPool(2)
    private var currentPage = "home"
    private var currentUser: FirebaseUser? = null
    private var pendingQuizAfterLogin = false
    private var activeCode = ""
    private var activeQuiz: Map<String, Any?> = emptyMap()
    private var activeQuestion: Map<String, Any?> = emptyMap()
    private var currentQuestionIndex = -1
    private var selectedQuestionLanguage = "hi"
    private var questionStartedMs = 0L
    private var questionSeconds = 10
    private var answeredCurrent = false
    private var answerLocked = false
    private var score = 0
    private var correctCount = 0
    private var questionTimer: CountDownTimer? = null
    private var quizRegistration: ListenerRegistration? = null
    private var questionRegistration: ListenerRegistration? = null
    private val contentRegistrations = mutableListOf<ListenerRegistration>()
    private var notices: List<Map<String, Any?>> = emptyList()
    private var events: List<Map<String, Any?>> = emptyList()
    private var activities: List<Map<String, Any?>> = emptyList()
    private var contactInfo: Map<String, Any?> = emptyMap()
    private var quizCodeInput: EditText? = null
    private var playerNameInput: EditText? = null
    private var liveStatus: TextView? = null
    private var liveQuestion: TextView? = null
    private var timerLabel: TextView? = null
    private var timerTickScheduled = false
    private var answerButtons = mutableListOf<MaterialButtonRef>()
    private var statusText: TextView? = null
    private var questionFeedback: TextView? = null

    private data class MaterialButtonRef(val view: Button, val optionIndex: Int)

    private val signInLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode != RESULT_OK) {
            toast("Google sign-in was cancelled.")
            return@registerForActivityResult
        }
        try {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            val account: GoogleSignInAccount = task.getResult(ApiException::class.java)
            val idToken = account.idToken
            if (idToken.isNullOrBlank()) {
                toast("Google ID token is missing. Check the Web Client ID in app setup.")
                return@registerForActivityResult
            }
            val credential = GoogleAuthProvider.getCredential(idToken, null)
            auth.signInWithCredential(credential).addOnSuccessListener {
                currentUser = it.user
                toast("Signed in successfully.")
                if (pendingQuizAfterLogin) {
                    pendingQuizAfterLogin = false
                    showQuizJoin()
                } else {
                    showProfile()
                }
            }.addOnFailureListener { toast("Firebase sign-in failed: " + (it.localizedMessage ?: "try again")) }
        } catch (e: Exception) {
            toast("Google sign-in failed: " + (e.localizedMessage ?: "check app setup"))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = cream
        window.navigationBarColor = paper
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR

        try {
            val options = FirebaseOptions.Builder()
                .setApiKey("AIzaSyCG85CidK3Dczuo9o21QG6AhTJjFAGdynE")
                .setApplicationId(getString(R.string.firebase_app_id))
                .setProjectId("netaji-club")
                .setGcmSenderId("1085917792894")
                .setStorageBucket("netaji-club.firebasestorage.app")
                .build()
            if (FirebaseApp.getApps(this).isEmpty()) FirebaseApp.initializeApp(this, options)
            auth = FirebaseAuth.getInstance()
            db = FirebaseFirestore.getInstance()
        } catch (e: Exception) {
            Toast.makeText(this, "Firebase initialization failed. Check app configuration.", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        val signInOptions = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getString(R.string.web_client_id))
            .requestEmail()
            .build()
        googleClient = GoogleSignIn.getClient(this, signInOptions)
        currentUser = auth.currentUser
        buildShell()
        subscribeTrustContent()
        showHome()
    }

    private fun buildShell() {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(cream)
            layoutParams = ViewGroup.LayoutParams(-1, -1)
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(18), dp(12), dp(16), dp(12))
            setBackgroundColor(paper)
            elevation = dp(3).toFloat()
        }
        header.addView(TrustLogoView(this), LinearLayout.LayoutParams(dp(56), dp(56)))
        val brand = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        brand.addView(text("Netaji Social & Welfare Trust", 16f, navy, true).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        brand.addView(text("WE SERVE • WE CARE • WE EMPOWER", 8.5f, muted, true).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setPadding(0, dp(3), 0, 0)
        })
        header.addView(brand, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(10) })

        val noticeBell = FrameLayout(this).apply {
            background = rounded(paleBlue, 18)
            isClickable = true
            setOnClickListener { showNotices() }
        }
        noticeBell.addView(TextView(this).apply {
            text = "🔔"
            textSize = 19f
            gravity = Gravity.CENTER
            setTextColor(navy)
        }, FrameLayout.LayoutParams(-1, -1))
        noticeBell.addView(View(this).apply {
            background = rounded(red, 8)
        }, FrameLayout.LayoutParams(dp(8), dp(8), Gravity.TOP or Gravity.END).apply {
            topMargin = dp(7)
            rightMargin = dp(7)
        })
        header.addView(noticeBell, LinearLayout.LayoutParams(dp(46), dp(46)))
        root.addView(header, LinearLayout.LayoutParams(-1, -2))

        refreshIndicator = text("↓  Pull down to refresh", 12f, navy, true).apply {
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(9), dp(16), dp(9))
            background = rounded(paper, 16, 0xFFE3E8F0.toInt())
            elevation = dp(3).toFloat()
            visibility = View.GONE
            alpha = 1f
        }
        root.addView(refreshIndicator, margin(-1, dp(38), 22, 5, 22, 5))

        scroller = ScrollView(this).apply {
            isFillViewport = true
            isSmoothScrollingEnabled = true
            overScrollMode = View.OVER_SCROLL_NEVER
            clipToPadding = false
            setPadding(0, 0, 0, dp(12))
        }
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(20))
        }
        scroller.addView(content, ViewGroup.LayoutParams(-1, -2))
        root.addView(scroller, LinearLayout.LayoutParams(-1, 0, 1f))

        bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setBackgroundColor(paper)
            elevation = dp(12).toFloat()
            setPadding(dp(8), dp(7), dp(8), dp(7))
        }
        listOf(
            Triple("⌂", "Home", "home"),
            Triple("▤", "Notices", "notices"),
            Triple("♧", "Activities", "activities"),
            Triple("●", "Profile", "profile")
        ).forEach { item ->
            val button = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                tag = item.third
                setPadding(dp(6), dp(5), dp(6), dp(5))
                background = rounded(paper, 15)
                setOnClickListener {
                    if (currentPage == "quiz-live") {
                        toast("Please finish the live quiz first.")
                    } else when (item.third) {
                        "home" -> showHome()
                        "notices" -> showNotices()
                        "activities" -> showActivities()
                        else -> showProfile()
                    }
                }
            }
            button.addView(text(item.first, 22f, navy, true).apply { gravity = Gravity.CENTER })
            button.addView(text(item.second, 11f, muted, currentPage == item.third).apply { gravity = Gravity.CENTER })
            bottomBar.addView(button, LinearLayout.LayoutParams(0, -2, 1f))
        }
        root.addView(bottomBar)
        setContentView(root)
        updateBottomNavigation()

        // A small custom pull gesture works consistently without adding a dependency
        // or intercepting taps inside inputs/buttons.
        scroller.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    pullTracking = scroller.scrollY <= 0 && !refreshInProgress
                    pullStartY = event.rawY
                    pullDistance = 0f
                }
                android.view.MotionEvent.ACTION_MOVE -> {
                    if (pullTracking && scroller.scrollY <= 0 && !refreshInProgress) {
                        pullDistance = (event.rawY - pullStartY).coerceAtLeast(0f)
                        if (pullDistance > dp(18)) {
                            refreshIndicator.visibility = View.VISIBLE
                            refreshIndicator.translationY = (pullDistance * 0.18f).coerceAtMost(dp(22).toFloat())
                            refreshIndicator.text = if (pullDistance >= dp(82)) "↑  Release to refresh" else "↓  Pull down to refresh"
                        }
                    }
                }
                android.view.MotionEvent.ACTION_UP -> {
                    if (pullTracking && pullDistance >= dp(82) && scroller.scrollY <= dp(2)) {
                        performPullRefresh()
                    } else {
                        hideRefreshIndicator()
                    }
                    pullTracking = false
                    pullDistance = 0f
                }
                android.view.MotionEvent.ACTION_CANCEL -> {
                    pullTracking = false
                    pullDistance = 0f
                    hideRefreshIndicator()
                }
            }
            false
        }

        // Android 15+ enforces edge-to-edge for newer target SDKs. Apply system
        // insets to the header/footer so status icons never cover the brand and
        // gesture/navigation controls never cover the bottom navigation.
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val status = insets.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout())
            val navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
            header.setPadding(dp(18), dp(12) + status.top, dp(16), dp(12))
            bottomBar.setPadding(dp(8), dp(7), dp(8), dp(7) + navigation.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(root)
    }

    private fun renderPage(page: String, keepScroll: Boolean = false) {
        currentPage = page
        questionTimer?.cancel()
        content.removeAllViews()
        if (!keepScroll) scroller.scrollTo(0, 0)
        bottomBar.visibility = if (page == "quiz-live") View.GONE else View.VISIBLE
        updateBottomNavigation()
    }

    private fun updateBottomNavigation() {
        if (!::bottomBar.isInitialized) return
        val selected = when (currentPage) {
            "notices" -> "notices"
            "activities" -> "activities"
            "profile", "contact", "detail", "login", "quiz-join", "quiz-completed" -> "profile"
            else -> "home"
        }
        for (i in 0 until bottomBar.childCount) {
            val item = bottomBar.getChildAt(i) as? LinearLayout ?: continue
            val isSelected = item.tag == selected
            item.background = rounded(if (isSelected) paleBlue else paper, 15)
            val icon = item.getChildAt(0) as? TextView
            val label = item.getChildAt(1) as? TextView
            icon?.setTextColor(if (isSelected) navy else muted)
            label?.setTextColor(if (isSelected) navy else muted)
            label?.typeface = if (isSelected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }
    }

    private fun performPullRefresh() {
        if (refreshInProgress) return
        refreshInProgress = true
        refreshIndicator.visibility = View.VISIBLE
        refreshIndicator.translationY = dp(8).toFloat()
        refreshIndicator.alpha = 1f
        refreshIndicator.text = "↻  Refreshing…"
        refreshIndicator.animate().translationY(0f).setDuration(160).start()
        root.postDelayed({
            if (currentPage == "quiz-live" || currentPage == "quiz-waiting") {
                if (activeCode.isNotBlank()) listenQuiz(activeCode)
            } else {
                subscribeTrustContent()
                when (currentPage) {
                    "home" -> showHome()
                    "notices" -> showNotices()
                    "events" -> showEvents()
                    "activities" -> showActivities()
                    "profile" -> showProfile()
                }
            }
            root.postDelayed({ hideRefreshIndicator() }, 650)
        }, 220)
    }

    private fun hideRefreshIndicator() {
        if (!::refreshIndicator.isInitialized || refreshInProgress && refreshIndicator.text.startsWith("↻")) return
        refreshIndicator.animate().alpha(0f).translationY(0f).setDuration(130).withEndAction {
            refreshIndicator.visibility = View.GONE
            refreshIndicator.alpha = 1f
            refreshIndicator.text = "↓  Pull down to refresh"
            refreshIndicator.translationY = 0f
            refreshInProgress = false
        }.start()
    }

    private fun subscribeTrustContent() {
        contentRegistrations.forEach { it.remove() }
        contentRegistrations.clear()
        contentRegistrations += db.collection("trustNotices").addSnapshotListener { snapshot, error ->
            if (error != null) return@addSnapshotListener
            notices = snapshot?.documents.orEmpty()
                .map { it.toMapWithId() }
                .filter { it["status"] == null || it["status"].toString() == "published" }
                .sortedByDescending { publishedMillis(it["publishedAt"]) }
            if (currentPage == "home" || currentPage == "notices") {
                if (!isFinishing) {
                    if (currentPage == "home") showHome() else showNotices()
                }
            }
        }
        contentRegistrations += db.collection("trustEvents").addSnapshotListener { snapshot, error ->
            if (error != null) return@addSnapshotListener
            events = snapshot?.documents.orEmpty()
                .map { it.toMapWithId() }
                .filter { it["status"] == null || it["status"].toString() == "published" }
                .sortedBy { publishedMillis(it["eventAt"] ?: it["publishedAt"]) }
            if (currentPage == "home") showHome()
        }
        contentRegistrations += db.collection("trustActivities").addSnapshotListener { snapshot, error ->
            if (error != null) return@addSnapshotListener
            activities = snapshot?.documents.orEmpty()
                .map { it.toMapWithId() }
                .filter { it["status"] == null || it["status"].toString() == "published" }
            if (currentPage == "activities") showActivities()
        }
        contentRegistrations += db.collection("trustInfo").document("contact").addSnapshotListener { snapshot, error ->
            if (error == null && snapshot != null && snapshot.exists()) {
                contactInfo = snapshot.data ?: emptyMap()
                if (currentPage == "profile") showProfile()
            }
        }
    }

    private fun showHome() {
        renderPage("home")
        content.addView(space(2))

        val hero = FrameLayout(this).apply {
            background = rounded(paper, 26, 0xFFE8DCC7.toInt())
            clipToOutline = true
            elevation = dp(3).toFloat()
        }
        hero.addView(TrustHeroArtworkView(this), FrameLayout.LayoutParams(-1, -1))
        val copy = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(17), dp(18), 0, dp(14))
        }
        copy.addView(text("NETAJI SOCIAL & WELFARE TRUST", 8.5f, saffron, true).apply {
            maxLines = 1
        })
        copy.addView(text("Serving our\ncommunity,\ntogether", 24f, navy, true).apply {
            setLineSpacing(dp(1).toFloat(), 1f)
            setPadding(0, dp(5), 0, dp(8))
        })
        copy.addView(text("Education  |  Environment\nSocial Welfare  |  Health\nEmpowerment", 11.5f, ink))
        hero.addView(copy, FrameLayout.LayoutParams(dp(220), -1, Gravity.TOP or Gravity.START))
        content.addView(hero, margin(-1, dp(242), 0, 0, 0, 18))

        content.addView(sectionHeading("Explore", "About the Trust") {
            showDetail("About Us", contactInfo["about"].stringOr("Netaji Social & Welfare Trust works to support education, environmental care, social welfare, health and community empowerment.") +
                "\n\nMission\n" + contactInfo["mission"].stringOr("To serve people and build a stronger, healthier and more inclusive community."))
        }, margin(-1, -2, 0, 0, 0, 10))

        val row1 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row1.addView(actionCard("▤", "Latest Notices", "Stay updated", paleBlue) { showNotices() },
            LinearLayout.LayoutParams(0, -2, 1f).apply { rightMargin = dp(6) })
        row1.addView(actionCard("▣", "Upcoming Events", "Join us", paleOrange) { showEvents() },
            LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(6) })
        content.addView(row1, margin(-1, -2, 0, 0, 0, 10))

        val row2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row2.addView(actionCard("♧", "Our Activities", "See our work", paleGreen) { showActivities() },
            LinearLayout.LayoutParams(0, -2, 1f).apply { rightMargin = dp(6) })
        row2.addView(actionCard("♡", "Volunteer With Us", "Make a difference", 0xFFFFE8D5.toInt()) {
            showDetail("Volunteer With Us", "Contact the Trust using the Contact Us section to learn about volunteering opportunities.")
        }, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(6) })
        content.addView(row2, margin(-1, -2, 0, 0, 0, 18))

        content.addView(sectionHeading("Pinned Notice", "View all") { showNotices() }, margin(-1, -2, 0, 0, 0, 8))
        val pinned = notices.firstOrNull { it["pinned"] == true } ?: notices.firstOrNull()
        if (pinned == null) {
            content.addView(emptyCard("No notices published yet. New notices from the Trust will appear here."))
        } else {
            content.addView(pinnedNoticeCard(pinned), margin(-1, -2, 0, 0, 0, 14))
        }

        content.addView(sectionHeading("Upcoming Events", "View all") { showEvents() }, margin(-1, -2, 0, 2, 0, 8))
        val upcoming = events.take(2)
        if (upcoming.isEmpty()) {
            content.addView(emptyCard("Upcoming events will be listed here when published."))
        } else {
            upcoming.forEach { event ->
                val meta = listOf(
                    event["dateText"].stringOr(""),
                    event["location"].stringOr("")
                ).filter { it.isNotBlank() }.joinToString(" • ")
                content.addView(contentCard(
                    event["title"].stringOr("Event"),
                    event["description"].stringOr(""),
                    meta.ifBlank { "Upcoming event" },
                    "📅"
                ) { showEventDetail(event) }, margin(-1, -2, 0, 0, 0, 9))
            }
        }

        content.addView(space(3))
        content.addView(primaryButton("🏆  Take Part in a Quiz") { openQuiz() }, margin(-1, dp(54), 0, 8, 0, 8))
        content.addView(text("Quiz & competitions use the existing Netaji Club competition system.", 11.5f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(dp(8), 0, dp(8), dp(8))
        })
    }

    private fun showNotices() {
        renderPage("notices")
        addPageHeading("Notices & Announcements", "Stay informed about our latest activities, events and updates.")

        val searchShell = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(paper, 17, 0xFFE4E8EE.toInt())
            setPadding(dp(13), 0, dp(12), 0)
            elevation = dp(1).toFloat()
        }
        searchShell.addView(text("⌕", 25f, muted, true).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(dp(30), dp(48)))
        val search = EditText(this).apply {
            hint = "Search notices..."
            isSingleLine = true
            textSize = 14f
            setTextColor(navy)
            setHintTextColor(muted)
            setPadding(dp(4), 0, dp(4), 0)
            setBackgroundColor(0x00000000)
        }
        searchShell.addView(search, LinearLayout.LayoutParams(0, dp(48), 1f))
        content.addView(searchShell, margin(-1, dp(50), 0, 1, 0, 12))

        var activeCategory = "All"
        var activeQuery = ""
        val categories = listOf("All") + notices.map { it["category"].stringOr("General") }
            .filter { it.isNotBlank() }
            .distinctBy { it.lowercase(Locale.ROOT) }
            .filterNot { it.equals("All", true) }
        val chipScroller = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        val chipRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        chipScroller.addView(chipRow)
        content.addView(chipScroller, margin(-1, dp(42), 0, 0, 0, 12))

        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(list)

        fun fill() {
            list.removeAllViews()
            val matching = notices.filter { notice ->
                val searchable = notice["title"].stringOr("") + " " +
                    notice["body"].stringOr("") + " " + notice["category"].stringOr("")
                searchable.contains(activeQuery, true) &&
                    (activeCategory == "All" || notice["category"].stringOr("General").equals(activeCategory, true))
            }
            if (matching.isEmpty()) {
                list.addView(emptyCard(if (activeQuery.isBlank() && activeCategory == "All")
                    "No notices published yet. New announcements will appear here."
                else "No notices match the current search or category."))
            } else {
                matching.forEach { notice ->
                    val meta = listOf(
                        dateLabel(notice["publishedAt"]),
                        notice["category"].stringOr("General")
                    ).filter { it.isNotBlank() }.joinToString(" • ")
                    list.addView(contentCard(
                        notice["title"].stringOr("Notice"),
                        notice["body"].stringOr(""),
                        meta,
                        if (notice["pinned"] == true) "📌" else "📢"
                    ) { showNoticeDetail(notice) }, margin(-1, -2, 0, 0, 0, 10))
                }
            }
        }

        fun buildChips() {
            chipRow.removeAllViews()
            categories.forEach { category ->
                val selected = category.equals(activeCategory, true)
                val chip = TextView(this).apply {
                    text = category
                    textSize = 12f
                    typeface = if (selected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
                    setTextColor(if (selected) paper else navy)
                    gravity = Gravity.CENTER
                    setPadding(dp(15), 0, dp(15), 0)
                    background = rounded(if (selected) navy else 0xFFF0F3F8.toInt(), 20)
                    isClickable = true
                    setOnClickListener {
                        activeCategory = category
                        buildChips()
                        fill()
                    }
                }
                chipRow.addView(chip, LinearLayout.LayoutParams(-2, dp(36)).apply { rightMargin = dp(7) })
            }
        }
        search.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                activeQuery = s?.toString().orEmpty()
                fill()
            }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
        buildChips()
        fill()
    }

    private fun showEvents() {
        renderPage("events")
        addPageHeading("Upcoming Events", "Community activities, celebrations and programmes.")
        if (events.isEmpty()) {
            content.addView(emptyCard("No events have been announced yet. Please check the Notices section later."))
        } else {
            events.forEach { event ->
                val meta = listOf(event["dateText"].stringOr(""), event["location"].stringOr(""))
                    .filter { it.isNotBlank() }.joinToString(" • ")
                content.addView(contentCard(
                    event["title"].stringOr("Event"),
                    event["description"].stringOr(""),
                    meta.ifBlank { "Upcoming event" },
                    "📅"
                ) { showEventDetail(event) }, margin(-1, -2, 0, 0, 0, 11))
            }
        }
        content.addView(secondaryButton("Back to Home") { showHome() }, margin(-1, dp(48), 0, 8, 0, 8))
    }

    private fun showActivities() {
        renderPage("activities")
        addPageHeading("Our Activities", "Working for a better and stronger community.")

        if (activities.isEmpty()) {
            val categories = listOf(
                Triple("📘", "Education Support", "Helping students for a brighter future."),
                Triple("🌱", "Environment Drive", "Clean and green community."),
                Triple("❤", "Health & Welfare", "Community health and well-being."),
                Triple("🤝", "Community Empowerment", "Stronger people, stronger community.")
            )
            categories.chunked(2).forEach { pair ->
                val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                pair.forEach { item ->
                    row.addView(actionCard(item.first, item.second, item.third,
                        when (item.second) {
                            "Environment Drive" -> paleGreen
                            "Health & Welfare" -> 0xFFFFE8EC.toInt()
                            "Community Empowerment" -> 0xFFFFF0D8.toInt()
                            else -> paleBlue
                        }) {
                        showDetail(item.second, "Activity details and updates will appear here when published by the Trust admin.")
                    }, LinearLayout.LayoutParams(0, -2, 1f).apply {
                        if (row.childCount == 0) rightMargin = dp(6) else leftMargin = dp(6)
                    })
                }
                content.addView(row, margin(-1, -2, 0, 0, 0, 10))
            }
            content.addView(emptyCard("Detailed activity updates will appear here when published."))
        } else {
            activities.chunked(2).forEach { pair ->
                val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.TOP }
                pair.forEach { activity ->
                    row.addView(activityFeatureCard(activity), LinearLayout.LayoutParams(0, -2, 1f).apply {
                        if (row.childCount == 0) rightMargin = dp(6) else leftMargin = dp(6)
                    })
                }
                if (pair.size == 1) row.addView(View(this), LinearLayout.LayoutParams(0, dp(1), 1f).apply { leftMargin = dp(6) })
                content.addView(row, margin(-1, -2, 0, 0, 0, 12))
            }
        }
        content.addView(primaryButton("🤝  Become a Volunteer") {
            showDetail("Volunteer With Us", "Use Contact Us to ask the Trust about current volunteering opportunities.")
        }, margin(-1, dp(54), 0, 6, 0, 8))
    }

    private fun showProfile() {
        renderPage("profile")
        val profileCard = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = rounded(paper, 22, 0xFFE5DCCB.toInt())
            elevation = dp(2).toFloat()
        }
        profileCard.addView(TrustLogoView(this), LinearLayout.LayoutParams(dp(66), dp(66)))
        val profileCopy = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), 0, 0, 0)
        }
        profileCopy.addView(text("Explore the Trust", 21f, navy, true))
        profileCopy.addView(text("Learn about our work and get involved.", 12f, muted).apply { setPadding(0, dp(4), 0, 0) })
        profileCard.addView(profileCopy, LinearLayout.LayoutParams(0, -2, 1f))
        content.addView(profileCard, margin(-1, -2, 0, 0, 0, 14))

        val options = listOf(
            Triple("ℹ", "About Us", "Our vision, mission and journey"),
            Triple("♧", "Members", "Our team and committee members"),
            Triple("♡", "Donate / Support", "Contribute to a better community"),
            Triple("☎", "Contact Us", "Get in touch with us"),
            Triple("▧", "Gallery", "Photos and moments from our events"),
            Triple("🏆", "Quiz & Competitions", "Participate in our quizzes and contests")
        )
        options.chunked(2).forEachIndexed { rowIndex, pair ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.TOP }
            pair.forEachIndexed { itemIndex, item ->
                val tint = when (rowIndex * 2 + itemIndex) {
                    0 -> 0xFFFFF0D8.toInt()
                    1 -> paleGreen
                    2 -> 0xFFFFE8EC.toInt()
                    3 -> paleBlue
                    4 -> 0xFFF0EAFE.toInt()
                    else -> 0xFFFFF0D8.toInt()
                }
                row.addView(actionCard(item.first, item.second, item.third, tint) {
                    when (item.second) {
                        "Quiz & Competitions" -> openQuiz()
                        "About Us" -> showDetail("About Us",
                            contactInfo["about"].stringOr("Netaji Social & Welfare Trust works to support education, environmental care, social welfare, health and community empowerment.") +
                                "\n\nMission\n" + contactInfo["mission"].stringOr("To serve people and build a stronger, healthier and more inclusive community."))
                        "Members" -> showDetail("Members", "The Trust's member and committee directory will appear here when it is published.")
                        "Donate / Support" -> showDonation()
                        "Contact Us" -> showContact()
                        "Gallery" -> showDetail("Gallery", "Photos from Trust programmes and community events will appear here when published.")
                        else -> showDetail(item.second, item.third)
                    }
                }, LinearLayout.LayoutParams(0, -2, 1f).apply {
                    if (row.childCount == 0) rightMargin = dp(6) else leftMargin = dp(6)
                })
            }
            content.addView(row, margin(-1, -2, 0, 0, 0, 10))
        }

        val footer = panel(0xFFFFF1D8.toInt())
        footer.addView(text("Netaji Social & Welfare Trust", 15f, navy, true))
        footer.addView(text("We serve • We care • We empower", 12f, muted).apply { setPadding(0, dp(4), 0, dp(10)) })
        footer.addView(tricolorBar())
        content.addView(footer, margin(-1, -2, 0, 7, 0, 14))

        if (currentUser == null) {
            content.addView(primaryButton("Sign in to take a quiz") { openQuiz() }, margin(-1, dp(52), 0, 0, 0, 8))
        } else {
            content.addView(panel().apply {
                addView(text("Signed in", 12f, muted, true))
                addView(text(currentUser?.email ?: "Google account", 13f, navy, true).apply { setPadding(0, dp(4), 0, dp(8)) })
                addView(secondaryButton("Log out") { logout() }, LinearLayout.LayoutParams(-1, dp(46)))
            }, margin(-1, -2, 0, 2, 0, 8))
        }
    }

    private fun showDonation() {
        val upi = contactInfo["upiId"].stringOr("")
        val detail = if (upi.isBlank()) {
            "Donation / support details have not been published yet. Please contact the Trust admin for verified payment details."
        } else {
            "Support the Trust using UPI ID:\n" + upi + "\n\nPlease verify the recipient name before making a payment."
        }
        showDetail("Donate / Support", detail)
    }

    private fun showContact() {
        val phone = contactInfo["phone"].stringOr("")
        val email = contactInfo["email"].stringOr("")
        val address = contactInfo["address"].stringOr("")
        renderPage("contact")
        addPageHeading("Contact Us", "Get in touch with Netaji Social & Welfare Trust.")
        content.addView(panel().apply {
            addView(text("☎  Phone", 12f, muted, true))
            addView(text(phone.ifBlank { "Not published yet" }, 15.5f, navy, true).apply { setPadding(0, dp(4), 0, dp(12)) })
            addView(text("✉  Email", 12f, muted, true))
            addView(text(email.ifBlank { "Not published yet" }, 15.5f, navy, true).apply { setPadding(0, dp(4), 0, dp(12)) })
            addView(text("⌖  Address", 12f, muted, true))
            addView(text(address.ifBlank { "Not published yet" }, 14.5f, ink).apply { setPadding(0, dp(4), 0, 0) })
        }, margin(-1, -2, 0, 0, 0, 12))
        if (phone.isNotBlank()) content.addView(secondaryButton("Call the Trust") {
            runCatching { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone))) }
        }, margin(-1, dp(50), 0, 0, 0, 8))
        if (email.isNotBlank()) content.addView(primaryButton("Email the Trust") {
            runCatching { startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + email))) }
        }, margin(-1, dp(50), 0, 0, 0, 8))
    }

    private fun openQuiz() {
        if (auth.currentUser == null) {
            pendingQuizAfterLogin = true
            showLogin()
        } else {
            currentUser = auth.currentUser
            showQuizJoin()
        }
    }

    private fun showLogin() {
        renderPage("login")
        val c = panel()
        c.gravity = Gravity.CENTER_HORIZONTAL
        c.setPadding(dp(22), dp(24), dp(22), dp(22))
        c.addView(TrustLogoView(this), LinearLayout.LayoutParams(dp(88), dp(88)))
        c.addView(text("Quiz & Competitions", 23f, navy, true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(7))
        })
        c.addView(text("Join the Trust's live quiz competitions with your Google Account. The existing website Admin controls the same competition.", 13.5f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(18))
        })
        c.addView(primaryButton("Continue with Google") { startGoogleSignIn() }, LinearLayout.LayoutParams(-1, dp(52)))
        c.addView(text("You can browse notices, events and activities without signing in.", 11.5f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(14), dp(8), 0)
        })
        content.addView(c, margin(-1, -2, 0, 8, 0, 12))
        content.addView(secondaryButton("Back to Home") { showHome() }, margin(-1, dp(48), 0, 0, 0, 0))
    }

    private fun startGoogleSignIn() {
        val clientId = getString(R.string.web_client_id)
        if (clientId.startsWith("REPLACE_")) {
            showDetail("One-time setup required",
                "The Android app needs the Web OAuth Client ID from the existing netaji-club Firebase project.\n\nUpdate android-app/app/src/main/res/values/strings.xml, then rebuild the APK. The website login is unchanged.")
            return
        }
        try {
            signInLauncher.launch(googleClient.signInIntent)
        } catch (e: Exception) {
            toast("Could not open Google sign-in: " + (e.localizedMessage ?: "try again"))
        }
    }

    private fun showQuizJoin() {
        renderPage("quiz-join")
        addPageHeading("Quiz & Competitions", "Join the same competition that the website Admin controls.")
        val form = panel()
        form.addView(text("🏆  JOIN A LIVE COMPETITION", 11f, saffron, true))
        form.addView(text("Almost ready!", 21f, navy, true).apply { setPadding(0, dp(6), 0, dp(5)) })
        form.addView(text("Enter your name, choose the question language and add the Quiz Code from the Admin.", 12.5f, muted).apply {
            setPadding(0, 0, 0, dp(15))
        })
        form.addView(text("Question Language", 12.5f, ink, true))
        val language = Spinner(this)
        language.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("हिंदी", "English", "বাংলা (Bengali)"))
        language.setSelection(when (selectedQuestionLanguage) { "en" -> 1; "bn" -> 2; else -> 0 })
        language.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: AdapterView<*>?) {}
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                selectedQuestionLanguage = listOf("hi", "en", "bn")[position]
            }
        }
        form.addView(language, margin(-1, dp(48), 0, 3, 0, 12))
        form.addView(text("Your Name", 12.5f, ink, true))
        playerNameInput = input(currentUser?.displayName.orEmpty(), "Enter your name")
        playerNameInput?.setSingleLine(true)
        form.addView(playerNameInput, margin(-1, dp(52), 0, 3, 0, 12))
        form.addView(text("Quiz Code", 12.5f, ink, true))
        quizCodeInput = input(getPreferences(MODE_PRIVATE).getString("last_quiz_code", "").orEmpty().uppercase(Locale.ROOT), "Enter the code from the Admin")
        quizCodeInput?.setSingleLine(true)
        quizCodeInput?.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        form.addView(quizCodeInput, margin(-1, dp(52), 0, 3, 0, 15))
        form.addView(primaryButton("Start Quiz  →") {
            val name = playerNameInput?.text?.toString()?.trim().orEmpty()
            val code = quizCodeInput?.text?.toString()?.trim()?.uppercase(Locale.ROOT).orEmpty()
            if (name.isBlank() || code.isBlank()) {
                toast("Enter your name and Quiz Code.")
            } else if (name.length > 40) {
                toast("Please keep your name within 40 characters.")
            } else {
                joinQuiz(code, name)
            }
        }, LinearLayout.LayoutParams(-1, dp(52)))
        content.addView(form)
        content.addView(text("Your saved code is only prefilled for convenience. The quiz will not join until you press Start Quiz.", 11.5f, muted).apply {
            setPadding(dp(4), dp(12), dp(4), 0)
        })
    }

    private fun joinQuiz(code: String, name: String) {
        val user = auth.currentUser ?: run { openQuiz(); return }
        toast("Checking Quiz Code…")
        db.collection("quizzes").document(code).get()
            .addOnSuccessListener { snapshot ->
                if (!snapshot.exists()) {
                    toast("Quiz Code was not found. Check the code with the Admin.")
                    return@addOnSuccessListener
                }
                val data = snapshot.data.orEmpty()
                val state = data["status"].stringOr("waiting")
                if (state == "completed") {
                    toast("This quiz has already ended. Ask the Admin for a new code.")
                    return@addOnSuccessListener
                }
                if (state !in listOf("waiting", "starting", "live")) {
                    toast("This quiz is not open for joining.")
                    return@addOnSuccessListener
                }
                val playerRef = db.collection("quizzes").document(code).collection("players").document(user.uid)
                playerRef.get().addOnSuccessListener { playerSnapshot ->
                    val done: () -> Unit = {
                        activeCode = code
                        activeQuiz = data
                        getPreferences(MODE_PRIVATE).edit()
                            .putString("last_quiz_code", code)
                            .putString("player_name", name)
                            .apply()
                        score = 0
                        correctCount = 0
                        answeredCurrent = false
                        answerLocked = false
                        listenQuiz(code)
                    }
                    if (!playerSnapshot.exists()) {
                        val player = hashMapOf<String, Any>(
                            "name" to name,
                            "email" to (user.email ?: ""),
                            "photoURL" to (user.photoUrl?.toString() ?: ""),
                            "joinedAt" to FieldValue.serverTimestamp()
                        )
                        playerRef.set(player).addOnSuccessListener { done() }
                            .addOnFailureListener { toast("Could not join: " + (it.localizedMessage ?: "Firebase permission error")) }
                    } else {
                        val existing = playerSnapshot.data.orEmpty()
                        val patch = hashMapOf<String, Any>()
                        if (user.email != null && existing["email"] != user.email) patch["email"] = user.email!!
                        if (user.photoUrl != null && existing["photoURL"] != user.photoUrl.toString()) patch["photoURL"] = user.photoUrl.toString()
                        val finish: () -> Unit = { done() }
                        if (patch.isEmpty()) finish() else playerRef.update(patch).addOnSuccessListener { finish() }
                            .addOnFailureListener { toast("Could not update player details: " + (it.localizedMessage ?: "try again")) }
                    }
                }.addOnFailureListener { toast("Player record could not be read: " + (it.localizedMessage ?: "check Firebase Rules")) }
            }
            .addOnFailureListener { toast("Could not read Quiz Code: " + (it.localizedMessage ?: "check Firebase Rules")) }
    }

    private fun listenQuiz(code: String) {
        quizRegistration?.remove()
        questionRegistration?.remove()
        quizRegistration = db.collection("quizzes").document(code).addSnapshotListener { snap, error ->
            if (error != null) {
                if (currentPage != "quiz-live") toast("Quiz sync failed: " + (error.localizedMessage ?: "check connection"))
                return@addSnapshotListener
            }
            if (snap == null || !snap.exists()) {
                showQuizJoin()
                toast("Quiz record is no longer available.")
                return@addSnapshotListener
            }
            activeQuiz = snap.data.orEmpty()
            questionSeconds = ((activeQuiz["settings"] as? Map<*, *>)?.get("questionSeconds") as? Number)?.toInt()
                ?: (activeQuiz["sec"] as? Number)?.toInt() ?: 10
            when (activeQuiz["status"].stringOr("waiting")) {
                "completed" -> showQuizCompleted()
                "starting" -> showWaiting("The quiz is about to start. Please stay on this screen.")
                "live" -> {
                    val idx = (activeQuiz["currentIndex"] as? Number)?.toInt() ?: 0
                    if (idx != currentQuestionIndex) {
                        currentQuestionIndex = idx
                        answeredCurrent = false
                        answerLocked = false
                        questionRegistration?.remove()
                        listenQuestion(code, idx)
                    }
                    if (currentPage != "quiz-live") showWaiting("The quiz is live. Loading the current question…")
                    updateLiveTimer()
                }
                else -> showWaiting("You are registered. Waiting for the Admin to start the quiz.")
            }
        }
    }

    private fun showWaiting(message: String) {
        if (currentPage != "quiz-live") {
            renderPage("quiz-waiting")
            addPageHeading("Quiz & Competitions", "Stay on this screen while the live competition is controlled by the Admin.")
            val c = panel()
            c.gravity = Gravity.CENTER_HORIZONTAL
            c.setPadding(dp(24), dp(25), dp(24), dp(25))
            c.addView(TextView(this).apply {
                text = "⌛"
                textSize = 44f
                gravity = Gravity.CENTER
                background = rounded(paleOrange, 24)
                setPadding(dp(12), dp(8), dp(12), dp(8))
            }, LinearLayout.LayoutParams(dp(76), dp(76)))
            liveStatus = text("WAITING", 13f, green, true).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(10), 0, dp(7))
            }
            c.addView(liveStatus)
            liveQuestion = text(message, 22f, navy, true).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(4), 0, dp(10))
            }
            c.addView(liveQuestion)
            c.addView(text("Questions and the timer will appear here as soon as the Admin starts the quiz.", 12.5f, muted).apply {
                gravity = Gravity.CENTER
            })
            content.addView(c)
        } else {
            liveQuestion?.text = message
        }
        bottomBar.visibility = View.GONE
    }

    private fun listenQuestion(code: String, index: Int) {
        questionRegistration?.remove()
        questionRegistration = db.collection("quizzes").document(code).collection("questions").document(index.toString())
            .addSnapshotListener { snap, error ->
                if (error != null) {
                    toast("Question sync failed: " + (error.localizedMessage ?: "check connection"))
                    return@addSnapshotListener
                }
                if (snap == null || !snap.exists()) {
                    showWaiting("The quiz is live. Waiting for the current question to sync…")
                    return@addSnapshotListener
                }
                activeQuestion = snap.data.orEmpty()
                questionStartedMs = (activeQuiz["questionStartedAt"] as? Number)?.toLong() ?: System.currentTimeMillis()
                answeredCurrent = false
                answerLocked = false
                loadPreviousAnswerAndRender(index)
            }
    }

    private fun loadPreviousAnswerAndRender(index: Int) {
        val user = auth.currentUser ?: return
        db.collection("quizzes").document(activeCode).collection("answers").document(user.uid + "_" + index)
            .get().addOnSuccessListener { existing ->
                if (index != currentQuestionIndex) return@addOnSuccessListener
                answeredCurrent = existing.exists()
                answerLocked = existing.exists()
                renderLiveQuestion()
                if (existing.exists()) {
                    val selected = (existing.getLong("sel") ?: -1L).toInt()
                    showAnswerFeedback(selected, index, restore = true)
                }
            }.addOnFailureListener {
                renderLiveQuestion()
            }
    }

    private fun renderLiveQuestion() {
        renderPage("quiz-live")
        content.addView(text(activeQuiz["name"].stringOr("Quiz Competition"), 24f, navy, true).apply {
            setPadding(0, dp(1), 0, dp(12))
        })

        val timerCard = panel(paleOrange)
        timerCard.orientation = LinearLayout.HORIZONTAL
        timerCard.gravity = Gravity.CENTER_VERTICAL
        timerCard.setPadding(dp(18), dp(13), dp(18), dp(13))
        val timerCopy = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        timerCopy.addView(text("TIME LEFT", 11f, navy, true))
        timerCopy.addView(text("One answer per question", 10f, muted).apply { setPadding(0, dp(3), 0, 0) })
        timerCard.addView(timerCopy, LinearLayout.LayoutParams(0, -2, 1f))
        timerLabel = text("-- sec", 26f, saffron, true).apply { gravity = Gravity.CENTER_VERTICAL }
        timerCard.addView(timerLabel)
        content.addView(timerCard, margin(-1, -2, 0, 0, 0, 13))

        val qCard = panel()
        qCard.setPadding(dp(18), dp(18), dp(18), dp(18))
        val num = ((activeQuiz["currentIndex"] as? Number)?.toInt() ?: 0) + 1
        val total = (activeQuiz["count"] as? Number)?.toInt() ?: 0
        val questionTop = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        questionTop.addView(text("QUESTION " + num + (if (total > 0) " OF " + total else ""), 11.5f, saffron, true),
            LinearLayout.LayoutParams(0, -2, 1f))
        questionTop.addView(text("LIVE", 10f, green, true).apply {
            gravity = Gravity.CENTER
            setPadding(dp(10), dp(5), dp(10), dp(5))
            background = rounded(paleGreen, 12)
        })
        qCard.addView(questionTop)
        qCard.addView(space(11))
        liveQuestion = text(localizedQuestion(activeQuestion, "question"), 22f, navy, true)
        liveQuestion?.setLineSpacing(dp(2).toFloat(), 1f)
        qCard.addView(liveQuestion)
        qCard.addView(space(15))
        answerButtons.clear()
        val options = localizedOptions(activeQuestion)
        for (i in 0 until minOf(4, options.size)) {
            val b = Button(this).apply {
                text = ('A' + i) + ".  " + options[i]
                textSize = 15f
                isAllCaps = false
                gravity = Gravity.CENTER_VERTICAL
                typeface = Typeface.DEFAULT
                minHeight = dp(54)
                setTextColor(navy)
                background = rounded(paper, 17, 0xFFD9E1EB.toInt())
                setPadding(dp(15), dp(12), dp(15), dp(12))
                isEnabled = !answerLocked
                setOnClickListener { submitAnswer(i) }
            }
            answerButtons += MaterialButtonRef(b, i)
            qCard.addView(b, margin(-1, dp(56), 0, 0, 0, 8))
        }
        questionFeedback = text(
            if (answerLocked) "Your answer is already submitted for this question."
            else "Choose one answer. You can submit only once per question.",
            11.5f, muted
        ).apply { setPadding(0, dp(7), 0, 0) }
        qCard.addView(questionFeedback)
        content.addView(qCard)
        updateLiveTimer()
    }

    private fun submitAnswer(selected: Int) {
        if (answeredCurrent || answerLocked || currentQuestionIndex < 0) return
        val user = auth.currentUser ?: return
        answeredCurrent = true
        answerLocked = true
        answerButtons.forEach { it.view.isEnabled = false }
        val elapsed = (System.currentTimeMillis() - questionStartedMs).coerceAtLeast(0L).coerceAtMost(600000L)
        val answer = hashMapOf<String, Any>(
            "uid" to user.uid,
            "q" to currentQuestionIndex,
            "sel" to selected,
            "at" to FieldValue.serverTimestamp(),
            "elapsedMs" to elapsed
        )
        db.collection("quizzes").document(activeCode).collection("answers")
            .document(user.uid + "_" + currentQuestionIndex)
            .set(answer).addOnSuccessListener {
                questionFeedback?.text = "Answer submitted. Checking your answer…"
                showAnswerFeedback(selected, currentQuestionIndex)
                refreshLocalScore()
            }.addOnFailureListener {
                answeredCurrent = false
                answerLocked = false
                answerButtons.forEach { it.view.isEnabled = true }
                questionFeedback?.text = "Answer could not be saved: " + (it.localizedMessage ?: "check connection")
            }
    }

    private fun showAnswerFeedback(selected: Int, index: Int, restore: Boolean = false) {
        val qcode = activeCode
        db.collection("quizzes").document(qcode).collection("keys").document(index.toString())
            .get().addOnSuccessListener { key ->
                if (qcode != activeCode || index != currentQuestionIndex || !key.exists()) return@addOnSuccessListener
                val correct = (key.getLong("correctIndex") ?: -1L).toInt()
                answerButtons.forEach { item ->
                    item.view.setTextColor(if (item.optionIndex == correct) green else if (item.optionIndex == selected) red else navy)
                    item.view.background = rounded(
                        if (item.optionIndex == correct) paleGreen else if (item.optionIndex == selected && selected != correct) 0xFFFFE9EC.toInt() else paper,
                        14,
                        if (item.optionIndex == correct) green else if (item.optionIndex == selected && selected != correct) red else 0xFFD7DFEA.toInt()
                    )
                }
                questionFeedback?.text = if (selected == correct) "Correct answer. Well done!" else "That answer is not correct. The correct option is " + ('A' + correct) + "."
                if (!restore) {
                    if (selected == correct) correctCount++
                    score = correctCount
                }
            }
    }

    private fun refreshLocalScore() {
        val user = auth.currentUser ?: return
        db.collection("quizzes").document(activeCode).collection("answers")
            .whereEqualTo("uid", user.uid).get().addOnSuccessListener { snap ->
                val answerRows = snap.documents
                if (answerRows.isEmpty()) {
                    correctCount = 0
                    score = 0
                    return@addOnSuccessListener
                }
                var checked = 0
                var right = 0
                answerRows.forEach { answer ->
                    val qi = answer.getLong("q")?.toInt()
                    val sel = answer.getLong("sel")?.toInt()
                    if (qi == null || sel == null) {
                        checked++
                        if (checked == answerRows.size) {
                            correctCount = right
                            score = right
                        }
                    } else {
                        // Rules permit reading a key only after this player's answer exists.
                        db.collection("quizzes").document(activeCode).collection("keys").document(qi.toString()).get()
                            .addOnSuccessListener { key ->
                                if (key.exists() && (key.getLong("correctIndex")?.toInt() ?: -1) == sel) right++
                                checked++
                                if (checked == answerRows.size) {
                                    correctCount = right
                                    score = right
                                }
                            }.addOnFailureListener {
                                checked++
                                if (checked == answerRows.size) {
                                    correctCount = right
                                    score = right
                                }
                            }
                    }
                }
            }
    }

    private fun updateLiveTimer() {
        if (currentPage != "quiz-live") {
            timerTickScheduled = false
            return
        }
        val started = (activeQuiz["questionStartedAt"] as? Number)?.toLong() ?: questionStartedMs
        val seconds = ((activeQuiz["settings"] as? Map<*, *>)?.get("questionSeconds") as? Number)?.toInt()
            ?: (activeQuiz["sec"] as? Number)?.toInt() ?: questionSeconds
        questionSeconds = seconds.coerceIn(5, 600)
        val remaining = if (started <= 0) questionSeconds else ceil((started + questionSeconds * 1000L - System.currentTimeMillis()) / 1000.0).toInt().coerceAtLeast(0)
        timerLabel?.text = remaining.toString() + " sec"
        if (remaining <= 0 && !answeredCurrent) {
            answerButtons.forEach { it.view.isEnabled = false }
            questionFeedback?.text = "Time is up. Wait for the Admin to move to the next question."
        }
        if (!timerTickScheduled) {
            timerTickScheduled = true
            root.postDelayed({
                timerTickScheduled = false
                updateLiveTimer()
            }, 1000)
        }
    }

    private fun showQuizCompleted() {
        questionTimer?.cancel()
        questionRegistration?.remove()
        renderPage("quiz-completed")
        addPageHeading("Quiz Completed", "Thank you for participating in the Trust's competition.")
        val c = panel()
        c.gravity = Gravity.CENTER_HORIZONTAL
        c.setPadding(dp(22), dp(24), dp(22), dp(24))
        c.addView(TextView(this).apply {
            text = "🏆"
            textSize = 48f
            gravity = Gravity.CENTER
            background = rounded(0xFFFFF0D8.toInt(), 25)
            setPadding(dp(12), dp(7), dp(12), dp(7))
        }, LinearLayout.LayoutParams(dp(84), dp(84)))
        c.addView(text("Thank you for participating!", 20f, navy, true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(5))
        })
        c.addView(text("Your answers have been shared with the same competition Admin. Results will follow the website's existing result process.", 13f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(4), 0, dp(16))
        })
        c.addView(primaryButton("Back to Home") { activeCode = ""; quizRegistration?.remove(); showHome() }, LinearLayout.LayoutParams(-1, dp(50)))
        content.addView(c)
    }

    private fun showNoticeDetail(notice: Map<String, Any?>) {
        showDetail(notice["title"].stringOr("Notice"), notice["body"].stringOr("No description was provided."))
    }

    private fun showEventDetail(event: Map<String, Any?>) {
        showDetail(event["title"].stringOr("Event"),
            event["description"].stringOr("") + "\n\nDate: " + event["dateText"].stringOr("To be announced") +
                "\nLocation: " + event["location"].stringOr("To be announced"))
    }

    private fun showActivityDetail(activity: Map<String, Any?>) {
        showDetail(activity["title"].stringOr("Activity"), activity["description"].stringOr(""))
    }

    private fun showDetail(title: String, body: String) {
        renderPage("detail")
        content.addView(text(title, 24f, navy, true).apply { setPadding(0, 0, 0, dp(10)) })
        content.addView(panel().apply {
            addView(text(body, 14f, ink).apply { setLineSpacing(dp(3).toFloat(), 1f) })
        }, margin(-1, -2, 0, 0, 0, 14))
        content.addView(secondaryButton("‹  Back") {
            when {
                title.contains("Notice", true) -> showNotices()
                title.contains("Event", true) -> showEvents()
                title.contains("Activity", true) -> showActivities()
                else -> showProfile()
            }
        }, margin(-1, dp(48), 0, 0, 0, 0))
    }

    private fun sectionHeading(title: String, action: String, click: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(text(title, 19f, navy, true), LinearLayout.LayoutParams(0, -2, 1f))
            addView(text(action, 12f, saffron, true).apply {
                setPadding(dp(8), dp(6), 0, dp(6))
                setOnClickListener { click() }
            })
        }

    private fun actionCard(icon: String, title: String, body: String, bg: Int, click: () -> Unit): LinearLayout {
        val c = panel()
        c.setPadding(dp(13), dp(13), dp(12), dp(13))
        c.minimumHeight = dp(126)
        c.addView(TextView(this).apply {
            text = icon
            textSize = 23f
            gravity = Gravity.CENTER
            setTextColor(if (bg == paleGreen) green else if (bg == paleBlue) 0xFF2483D6.toInt() else saffron)
            background = rounded(bg, 16)
        }, LinearLayout.LayoutParams(dp(44), dp(44)))
        c.addView(space(9))
        c.addView(text(title, 13.5f, navy, true).apply {
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        c.addView(space(3))
        c.addView(text(body, 11.5f, muted).apply {
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        c.isClickable = true
        c.setOnClickListener { click() }
        return c
    }

    private fun contentCard(title: String, body: String, meta: String, icon: String, click: () -> Unit): LinearLayout {
        val c = panel()
        c.orientation = LinearLayout.HORIZONTAL
        c.gravity = Gravity.CENTER_VERTICAL
        c.setPadding(dp(12), dp(12), dp(12), dp(12))
        val iconBox = TextView(this).apply {
            text = icon
            textSize = 24f
            gravity = Gravity.CENTER
            setTextColor(navy)
            background = rounded(when (icon) {
                "📅" -> paleBlue
                "📌" -> 0xFFFFF0D8.toInt()
                "🌿" -> paleGreen
                else -> paleOrange
            }, 16)
        }
        c.addView(iconBox, LinearLayout.LayoutParams(dp(54), dp(60)))
        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), 0, dp(4), 0)
        }
        info.addView(text(title, 14.5f, navy, true).apply {
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        if (meta.isNotBlank()) info.addView(text(meta, 10.5f, green, true).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setPadding(0, dp(4), 0, dp(4))
        })
        info.addView(text(body, 11.5f, muted).apply {
            maxLines = 3
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        c.addView(info, LinearLayout.LayoutParams(0, -2, 1f))
        c.addView(text("›", 28f, muted, true).apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(dp(20), -2))
        c.isClickable = true
        c.setOnClickListener { click() }
        return c
    }

    private fun emptyCard(message: String): View = panel(0xFFFFFCF5.toInt()).apply {
        addView(TextView(this@MainActivity).apply {
            text = "📣"
            textSize = 25f
            setTextColor(saffron)
        })
        addView(text(message, 13f, muted).apply { setPadding(0, dp(4), 0, 0) })
    }

    private fun panel(bg: Int = paper): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(17), dp(17), dp(17), dp(17))
        background = rounded(bg, 23, 0xFFE9E2D4.toInt())
        elevation = dp(2).toFloat()
    }

    private fun tricolorBar(): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(View(this@MainActivity).apply { setBackgroundColor(saffron) }, LinearLayout.LayoutParams(0, dp(5), 1f))
        addView(View(this@MainActivity).apply { setBackgroundColor(paper) }, LinearLayout.LayoutParams(0, dp(5), 1f))
        addView(View(this@MainActivity).apply { setBackgroundColor(green) }, LinearLayout.LayoutParams(0, dp(5), 1f))
        clipToOutline = true
        background = rounded(paper, 6)
    }

    private fun primaryButton(label: String, click: () -> Unit): Button = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 14f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(paper)
        background = rounded(saffron, 15)
        setPadding(dp(12), dp(10), dp(12), dp(10))
        setOnClickListener { click() }
    }

    private fun secondaryButton(label: String, click: () -> Unit): Button = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 14f
        setTextColor(navy)
        background = rounded(paper, 15, 0xFFD2DCE9.toInt())
        setPadding(dp(12), dp(8), dp(12), dp(8))
        setOnClickListener { click() }
    }

    private fun input(value: String, hintText: String): EditText = EditText(this).apply {
        setText(value)
        hint = hintText
        textSize = 15f
        setTextColor(ink)
        setHintTextColor(muted)
        setPadding(dp(14), dp(10), dp(14), dp(10))
        background = rounded(paper, 14, 0xFFD7DFEA.toInt())
    }

    private fun text(value: String, size: Float, color: Int, bold: Boolean = false): TextView = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        setLineSpacing(dp(2).toFloat(), 1f)
    }

    private fun space(height: Int): View = View(this).apply { layoutParams = LinearLayout.LayoutParams(1, dp(height)) }

    private fun margin(width: Int, height: Int, left: Int, top: Int, right: Int, bottom: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(width, height).apply {
            setMargins(dp(left), dp(top), dp(right), dp(bottom))
        }

    private fun rounded(color: Int, radius: Int, stroke: Int? = null): android.graphics.drawable.GradientDrawable =
        android.graphics.drawable.GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radius).toFloat()
            if (stroke != null) setStroke(dp(1), stroke)
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()

    private fun dateLabel(value: Any?): String = when (value) {
        is Timestamp -> SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(value.toDate())
        is Number -> SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date(value.toLong()))
        is String -> value
        else -> ""
    }

    private fun publishedMillis(value: Any?): Long = when (value) {
        is Timestamp -> value.toDate().time
        is Number -> value.toLong()
        else -> 0L
    }

    @Suppress("UNCHECKED_CAST")
    private fun DocumentSnapshot.toMapWithId(): Map<String, Any?> =
        (data ?: emptyMap()).toMutableMap().apply { put("id", id) }

    private fun Any?.stringOr(default: String): String = if (this is String && isNotBlank()) this else default

    @Suppress("UNCHECKED_CAST")
    private fun localizedQuestion(question: Map<String, Any?>, field: String): String {
        val translations = question["translations"] as? Map<String, Any?>
        val chosen = translations?.get(selectedQuestionLanguage) as? Map<String, Any?>
        return (chosen?.get(field) as? String)?.takeIf { it.isNotBlank() }
            ?: (question[field] as? String).orEmpty()
    }

    @Suppress("UNCHECKED_CAST")
    private fun localizedOptions(question: Map<String, Any?>): List<String> {
        val translations = question["translations"] as? Map<String, Any?>
        val chosen = translations?.get(selectedQuestionLanguage) as? Map<String, Any?>
        val opts = chosen?.get("options") as? List<*>
        if (opts != null && opts.size == 4) return opts.map { it?.toString().orEmpty() }
        return (question["options"] as? List<*>)?.map { it?.toString().orEmpty() } ?: emptyList()
    }

    private fun logout() {
        if (currentPage == "quiz-live") {
            toast("You cannot log out during an active quiz.")
            return
        }
        auth.signOut()
        googleClient.signOut()
        currentUser = null
        showProfile()
    }

    @Deprecated("Deprecated in Android API; callback kept for Google Sign-In compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onBackPressed() {
        if (currentPage == "quiz-live") {
            toast("Please remain on the quiz screen until the Admin ends the competition.")
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        questionTimer?.cancel()
        quizRegistration?.remove()
        questionRegistration?.remove()
        contentRegistrations.forEach { it.remove() }
    }
}

private class TrustLogoView(context: Context) : View(context) {
    private val navy = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF102F5D.toInt(); style = Paint.Style.FILL }
    private val navyStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF102F5D.toInt(); style = Paint.Style.STROKE; strokeWidth = 2.2f }
    private val orange = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF26A21.toInt(); style = Paint.Style.STROKE; strokeWidth = 4.5f; strokeCap = Paint.Cap.ROUND }
    private val green = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF238548.toInt(); style = Paint.Style.STROKE; strokeWidth = 4.5f; strokeCap = Paint.Cap.ROUND }
    private val white = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFF8E8.toInt(); style = Paint.Style.FILL }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF102F5D.toInt(); textAlign = Paint.Align.CENTER; typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD) }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val s = minOf(width, height).toFloat()
        if (s <= 0f) return
        val cx = width / 2f
        val cy = height / 2f
        val r = s * 0.47f
        canvas.drawCircle(cx, cy, r, orange)
        canvas.drawCircle(cx, cy, r - s * .045f, navyStroke)
        val seal = Path().apply { addCircle(cx, cy, r - s * .065f, Path.Direction.CW) }
        val save = canvas.save()
        canvas.clipPath(seal)
        canvas.drawCircle(cx, cy, r, white)

        // Saffron and green strokes echo the Trust's original emblem.
        val swashOrange = Path().apply {
            moveTo(cx - s*.39f, cy - s*.03f)
            cubicTo(cx - s*.22f, cy - s*.30f, cx + s*.12f, cy - s*.08f, cx + s*.39f, cy - s*.22f)
        }
        val swashGreen = Path().apply {
            moveTo(cx - s*.40f, cy + s*.21f)
            cubicTo(cx - s*.17f, cy + s*.01f, cx + s*.16f, cy + s*.32f, cx + s*.40f, cy + s*.12f)
        }
        canvas.drawPath(swashOrange, orange)
        canvas.drawPath(swashGreen, green)

        // Stylised Netaji-inspired profile: cap, face, glasses, collar and shoulders.
        canvas.drawOval(RectF(cx-s*.26f, cy-s*.04f, cx+s*.24f, cy+s*.30f), navy)
        canvas.drawRoundRect(RectF(cx-s*.11f, cy+s*.14f, cx+s*.12f, cy+s*.34f), s*.04f, s*.04f, white)
        canvas.drawOval(RectF(cx-s*.17f, cy-s*.20f, cx+s*.16f, cy+s*.19f), navy)
        canvas.drawOval(RectF(cx-s*.145f, cy-s*.165f, cx+s*.125f, cy+s*.155f), white)
        canvas.drawRoundRect(RectF(cx-s*.20f, cy-s*.25f, cx+s*.18f, cy-s*.13f), s*.06f, s*.06f, navy)
        canvas.drawOval(RectF(cx-s*.24f, cy-s*.14f, cx+s*.21f, cy-s*.085f), navy)
        canvas.drawOval(RectF(cx-s*.105f, cy-s*.075f, cx-s*.015f, cy+s*.005f), navyStroke)
        canvas.drawOval(RectF(cx+s*.015f, cy-s*.075f, cx+s*.105f, cy+s*.005f), navyStroke)
        canvas.drawLine(cx-s*.015f, cy-s*.04f, cx+s*.015f, cy-s*.04f, navyStroke)
        canvas.drawCircle(cx-s*.06f, cy-s*.038f, s*.012f, navy)
        canvas.drawCircle(cx+s*.06f, cy-s*.038f, s*.012f, navy)
        canvas.drawLine(cx, cy-s*.02f, cx-s*.012f, cy+s*.045f, navyStroke)
        canvas.drawLine(cx-s*.01f, cy+s*.075f, cx+s*.045f, cy+s*.07f, navyStroke)
        canvas.drawLine(cx-s*.055f, cy+s*.105f, cx+s*.04f, cy+s*.105f, navyStroke)
        canvas.drawLine(cx-s*.12f, cy+s*.18f, cx-s*.06f, cy+s*.23f, white)
        canvas.drawLine(cx+s*.12f, cy+s*.18f, cx+s*.06f, cy+s*.23f, white)

        // Small community/education symbols along the lower rim.
        canvas.drawRect(RectF(cx-s*.34f, cy+s*.285f, cx-s*.22f, cy+s*.34f), navy)
        canvas.drawRect(RectF(cx-s*.205f, cy+s*.285f, cx-s*.085f, cy+s*.34f), navy)
        canvas.drawLine(cx-s*.025f, cy+s*.35f, cx-s*.025f, cy+s*.285f, navyStroke)
        canvas.drawCircle(cx-s*.025f, cy+s*.275f, s*.025f, green)
        canvas.drawCircle(cx+s*.12f, cy+s*.30f, s*.026f, green)
        canvas.drawCircle(cx+s*.18f, cy+s*.30f, s*.026f, green)
        canvas.drawLine(cx+s*.12f, cy+s*.33f, cx+s*.18f, cy+s*.33f, navyStroke)

        textPaint.textSize = s * .068f
        canvas.drawText("NETAJI SOCIAL & WELFARE TRUST", cx, cy - s*.335f, textPaint)
        canvas.drawRect(RectF(cx-s*.26f, cy+s*.37f, cx-s*.09f, cy+s*.39f), orange.apply { style = Paint.Style.FILL; strokeWidth = 1f })
        canvas.drawRect(RectF(cx-s*.06f, cy+s*.37f, cx+s*.10f, cy+s*.39f), green.apply { style = Paint.Style.FILL; strokeWidth = 1f })
        canvas.restoreToCount(save)
        canvas.drawCircle(cx, cy, r, orange.apply { style = Paint.Style.STROKE; strokeWidth = 3f })
        canvas.drawCircle(cx, cy, r - s*.045f, navyStroke)
    }
}
