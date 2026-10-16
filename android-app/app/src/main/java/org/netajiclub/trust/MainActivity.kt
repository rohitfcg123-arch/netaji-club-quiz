package org.netajiclub.trust

import android.content.Intent
import android.graphics.Canvas
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
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setBackgroundColor(paper)
        }
        header.addView(TrustLogoView(this), LinearLayout.LayoutParams(dp(58), dp(58)))
        val brand = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        brand.addView(text("Netaji Social & Welfare Trust", 15f, navy, true).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        brand.addView(text("WE SERVE • WE CARE • WE EMPOWER", 8.5f, muted, true).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setPadding(0, dp(3), 0, 0)
        })
        header.addView(brand, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(10) })
        val noticeBell = Button(this).apply {
            text = "🔔"
            textSize = 18f
            setTextColor(navy)
            background = rounded(paleBlue, 18)
            minWidth = dp(44)
            setPadding(dp(4), dp(2), dp(4), dp(2))
            setOnClickListener { showNotices() }
        }
        header.addView(noticeBell, LinearLayout.LayoutParams(dp(44), dp(44)))
        root.addView(header)

        scroller = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            setPadding(0, 0, 0, dp(12))
        }
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        scroller.addView(content, ViewGroup.LayoutParams(-1, -2))
        root.addView(scroller, LinearLayout.LayoutParams(-1, 0, 1f))

        bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setBackgroundColor(paper)
            elevation = dp(10).toFloat()
            setPadding(dp(6), dp(6), dp(6), dp(6))
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
                setPadding(dp(4), dp(4), dp(4), dp(4))
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

        // Android 15+ enforces edge-to-edge for newer target SDKs. Apply system
        // insets to the header/footer so status icons never cover the brand and
        // gesture/navigation controls never cover the bottom navigation.
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val status = insets.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout())
            val navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
            header.setPadding(dp(16), dp(12) + status.top, dp(16), dp(12))
            bottomBar.setPadding(dp(6), dp(6), dp(6), dp(6) + navigation.bottom)
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
        val hero = panel()
        hero.addView(text("Serving our community, together", 26f, navy, true).apply {
            setPadding(0, dp(2), 0, dp(8))
        })
        hero.addView(text("Education  |  Environment  |  Social Welfare  |  Health  |  Empowerment", 13f, ink))
        hero.addView(tricolorBar())
        hero.addView(space(12))
        hero.addView(text("Welcome to Netaji Social & Welfare Trust", 15f, navy, true))
        hero.addView(text("Community care, learning and service — bringing people together.", 13f, muted).apply {
            setPadding(0, dp(5), 0, 0)
        })
        content.addView(hero, margin(-1, -2, 0, 0, 0, 12))

        content.addView(text("Explore", 19f, navy, true), margin(-1, -2, 2, 4, 0, 8))
        val row1 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row1.addView(actionCard("▤", "Latest Notices", "Stay updated", paleBlue) { showNotices() },
            LinearLayout.LayoutParams(0, -2, 1f).apply { rightMargin = dp(6) })
        row1.addView(actionCard("▣", "Upcoming Events", "Join us", paleOrange) { showEvents() },
            LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(6) })
        content.addView(row1, margin(-1, -2, 0, 0, 0, 10))
        val row2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row2.addView(actionCard("♧", "Our Activities", "See our work", paleGreen) { showActivities() },
            LinearLayout.LayoutParams(0, -2, 1f).apply { rightMargin = dp(6) })
        row2.addView(actionCard("♡", "Volunteer With Us", "Make a difference", 0xFFFFE8D5.toInt()) { showDetail("Volunteer With Us", "Contact the Trust using the Contact Us section to learn about volunteering opportunities.") },
            LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(6) })
        content.addView(row2, margin(-1, -2, 0, 0, 0, 16))

        content.addView(sectionHeading("Pinned Notice", "View all") { showNotices() }, margin(-1, -2, 0, 0, 0, 8))
        val pinned = notices.firstOrNull { it["pinned"] == true } ?: notices.firstOrNull()
        if (pinned == null) {
            content.addView(emptyCard("No notices published yet. New notices from the Trust will appear here."))
        } else {
            content.addView(contentCard(
                title = pinned["title"].stringOr("Notice"),
                body = pinned["body"].stringOr(""),
                meta = pinned["category"].stringOr("Notice"),
                icon = "📣",
                click = { showNoticeDetail(pinned) }
            ), margin(-1, -2, 0, 0, 0, 14))
        }

        content.addView(sectionHeading("Upcoming Events", "View all") { showEvents() }, margin(-1, -2, 0, 4, 0, 8))
        val upcoming = events.take(2)
        if (upcoming.isEmpty()) content.addView(emptyCard("Upcoming events will be listed here when published."))
        else upcoming.forEach { content.addView(contentCard(
            it["title"].stringOr("Event"),
            it["description"].stringOr(""),
            it["dateText"].stringOr(it["location"].stringOr("Event")),
            "📅"
        ) { showEventDetail(it) }, margin(-1, -2, 0, 0, 0, 8)) }

        content.addView(space(8))
        content.addView(primaryButton("Take Part in a Quiz  →") { openQuiz() }, margin(-1, dp(52), 0, 0, 0, 10))
        content.addView(text("Quiz & competitions are powered by the same Netaji Club competition system.", 12f, muted))
    }

    private fun showNotices() {
        renderPage("notices")
        content.addView(text("Notices & Announcements", 24f, navy, true))
        content.addView(text("Stay informed about our latest activities, events and updates.", 13f, muted), margin(-1, -2, 0, 4, 0, 14))
        val search = EditText(this).apply {
            hint = "Search notices..."
            isSingleLine = true
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = rounded(paper, 16, 0xFFE5E7EB.toInt())
        }
        content.addView(search, margin(-1, dp(48), 0, 0, 0, 12))
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(list)
        fun fill(filter: String) {
            list.removeAllViews()
            val matching = notices.filter {
                it["title"].stringOr("").contains(filter, true) ||
                    it["body"].stringOr("").contains(filter, true) ||
                    it["category"].stringOr("").contains(filter, true)
            }
            if (matching.isEmpty()) list.addView(emptyCard(if (filter.isBlank()) "No notices published yet." else "No matching notices found."))
            else matching.forEach { n ->
                list.addView(contentCard(n["title"].stringOr("Notice"), n["body"].stringOr(""), dateLabel(n["publishedAt"]), "📢") { showNoticeDetail(n) },
                    margin(-1, -2, 0, 0, 0, 10))
            }
        }
        fill("")
        search.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = fill(s?.toString().orEmpty())
            override fun afterTextChanged(s: android.text.Editable?) {}
        })
    }

    private fun showEvents() {
        renderPage("events")
        content.addView(text("Upcoming Events", 24f, navy, true))
        content.addView(text("Community activities and events", 13f, muted), margin(-1, -2, 0, 2, 0, 12))
        if (events.isEmpty()) content.addView(emptyCard("No events have been announced yet. Please check the Notices section later."))
        else events.forEach { e ->
            content.addView(contentCard(e["title"].stringOr("Event"), e["description"].stringOr(""),
                listOf(e["dateText"].stringOr(""), e["location"].stringOr("")).filter { it.isNotBlank() }.joinToString(" • "),
                "📅") { showEventDetail(e) }, margin(-1, -2, 0, 0, 0, 10))
        }
    }

    private fun showActivities() {
        renderPage("activities")
        content.addView(text("Our Activities", 24f, navy, true))
        content.addView(text("Working for a better and stronger community.", 13f, muted), margin(-1, -2, 0, 2, 0, 12))
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
                    row.addView(actionCard(item.first, item.second, item.third, paleGreen) {
                        showDetail(item.second, "Activity details and updates will appear here when published by the Trust admin.")
                    }, LinearLayout.LayoutParams(0, -2, 1f).apply { if (row.childCount == 0) rightMargin = dp(6) else leftMargin = dp(6) })
                }
                content.addView(row, margin(-1, -2, 0, 0, 0, 10))
            }
            content.addView(emptyCard("Detailed activity updates will appear here when published."))
        } else {
            activities.forEach { a ->
                content.addView(contentCard(a["title"].stringOr("Activity"), a["description"].stringOr(""),
                    a["category"].stringOr("Community"), "🌿") { showActivityDetail(a) },
                    margin(-1, -2, 0, 0, 0, 10))
            }
        }
        content.addView(primaryButton("Become a Volunteer") { showDetail("Volunteer With Us", "Use Contact Us to ask the Trust about current volunteering opportunities.") },
            margin(-1, dp(52), 0, 10, 0, 8))
    }

    private fun showProfile() {
        renderPage("profile")
        val profileCard = panel()
        profileCard.gravity = Gravity.CENTER_HORIZONTAL
        profileCard.addView(TrustLogoView(this), LinearLayout.LayoutParams(dp(100), dp(100)))
        profileCard.addView(text("Netaji Social & Welfare Trust", 21f, navy, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(8), 0, dp(4)) })
        profileCard.addView(text("We Serve • We Care • We Empower", 12f, muted).apply { gravity = Gravity.CENTER })
        content.addView(profileCard, margin(-1, -2, 0, 0, 0, 12))

        content.addView(text("Explore the Trust", 21f, navy, true), margin(-1, -2, 0, 0, 0, 8))
        val options = listOf(
            Triple("ℹ", "About Us", "Our vision, mission and journey"),
            Triple("♧", "Members", "Team and committee members"),
            Triple("♡", "Donate / Support", "Contribute to a better community"),
            Triple("☎", "Contact Us", "Get in touch with us"),
            Triple("▧", "Gallery", "Photos and moments from our events"),
            Triple("🏆", "Quiz & Competitions", "Participate in our quizzes and contests")
        )
        options.chunked(2).forEach { pair ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            pair.forEach { item ->
                row.addView(actionCard(item.first, item.second, item.third, if (row.childCount == 0) paleBlue else paleGreen) {
                    when (item.second) {
                        "Quiz & Competitions" -> openQuiz()
                        "About Us" -> showDetail("About Us", contactInfo["about"].stringOr("Netaji Social & Welfare Trust works to support education, environmental care, social welfare, health and community empowerment.") + "\n\nMission\n" + contactInfo["mission"].stringOr("To serve people and build a stronger, healthier and more inclusive community."))
                        "Members" -> showDetail("Members", "The Trust's member and committee directory will appear here when it is published.")
                        "Donate / Support" -> showDonation()
                        "Contact Us" -> showContact()
                        "Gallery" -> showDetail("Gallery", "Photos from Trust programmes and community events will appear here when published.")
                        else -> showDetail(item.second, item.third)
                    }
                }, LinearLayout.LayoutParams(0, -2, 1f).apply { if (row.childCount == 0) rightMargin = dp(6) else leftMargin = dp(6) })
            }
            content.addView(row, margin(-1, -2, 0, 0, 0, 10))
        }

        if (currentUser == null) {
            content.addView(primaryButton("Sign in to take a quiz") { openQuiz() }, margin(-1, dp(52), 0, 8, 0, 8))
        } else {
            content.addView(text("Signed in as " + (currentUser?.email ?: "Google account"), 12f, muted), margin(-1, -2, 0, 8, 0, 8))
            content.addView(secondaryButton("Log out") { logout() }, margin(-1, dp(48), 0, 0, 0, 8))
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
        content.addView(text("Contact Us", 24f, navy, true))
        content.addView(text("Get in touch with Netaji Social & Welfare Trust.", 13f, muted), margin(-1, -2, 0, 4, 0, 12))
        content.addView(panel().apply {
            addView(text("Phone", 13f, muted, true))
            addView(text(phone.ifBlank { "Not published yet" }, 16f, ink, true), margin(-1, -2, 0, 3, 0, 12))
            addView(text("Email", 13f, muted, true))
            addView(text(email.ifBlank { "Not published yet" }, 16f, ink, true), margin(-1, -2, 0, 3, 0, 12))
            addView(text("Address", 13f, muted, true))
            addView(text(address.ifBlank { "Not published yet" }, 15f, ink))
        }, margin(-1, -2, 0, 0, 0, 12))
        if (phone.isNotBlank()) content.addView(secondaryButton("Call the Trust") {
            runCatching { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone))) }
        }, margin(-1, dp(48), 0, 0, 0, 8))
        if (email.isNotBlank()) content.addView(primaryButton("Email the Trust") {
            runCatching { startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + email))) }
        }, margin(-1, dp(48), 0, 0, 0, 8))
        content.addView(secondaryButton("Back to Profile") { showProfile() }, margin(-1, dp(48), 0, 12, 0, 0))
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
        c.addView(TrustLogoView(this), LinearLayout.LayoutParams(dp(90), dp(90)))
        c.addView(text("Quiz & Competitions", 23f, navy, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(10), 0, dp(6)) })
        c.addView(text("Sign in with your Google Account to join a live quiz. Your account is linked to the existing Netaji Club competition system.", 14f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(12))
        })
        c.addView(primaryButton("Continue with Google") { startGoogleSignIn() }, LinearLayout.LayoutParams(-1, dp(52)))
        c.addView(text("Not ready to play yet? You can still browse notices, events and activities without signing in.", 12f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(12), dp(8), 0)
        })
        content.addView(c, margin(-1, -2, 0, 8, 0, 0))
        content.addView(secondaryButton("Back to Home") { showHome() }, margin(-1, dp(48), 0, 8, 0, 0))
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
        content.addView(text("Quiz & Competitions", 25f, navy, true))
        content.addView(text("Join the same competition that the website Admin controls.", 13f, muted), margin(-1, -2, 0, 4, 0, 12))
        val form = panel()
        form.addView(text("Question Language", 13f, ink, true))
        val language = Spinner(this)
        language.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("हिंदी", "English", "বাংলা (Bengali)"))
        language.setSelection(when (selectedQuestionLanguage) { "en" -> 1; "bn" -> 2; else -> 0 })
        language.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: AdapterView<*>?) {}
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                selectedQuestionLanguage = listOf("hi", "en", "bn")[position]
            }
        }
        form.addView(language, margin(-1, dp(48), 0, 2, 0, 12))
        form.addView(text("Your Name", 13f, ink, true))
        playerNameInput = input(currentUser?.displayName.orEmpty(), "Enter your name")
        playerNameInput?.setSingleLine(true)
        form.addView(playerNameInput, margin(-1, dp(52), 0, 2, 0, 12))
        form.addView(text("Quiz Code", 13f, ink, true))
        quizCodeInput = input(getPreferences(MODE_PRIVATE).getString("last_quiz_code", "").orEmpty().uppercase(Locale.ROOT), "Enter the code from the Admin")
        quizCodeInput?.setSingleLine(true)
        quizCodeInput?.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        form.addView(quizCodeInput, margin(-1, dp(52), 0, 2, 0, 12))
        form.addView(primaryButton("Start Quiz") {
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
        content.addView(space(10))
        content.addView(text("Your saved code is only prefilled for convenience. The quiz will not join until you press Start Quiz.", 12f, muted))
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
            content.addView(text("Quiz & Competitions", 24f, navy, true))
            content.addView(space(12))
            val c = panel()
            c.gravity = Gravity.CENTER_HORIZONTAL
            c.addView(text("⏳", 42f, saffron, true).apply { gravity = Gravity.CENTER })
            liveStatus = text("WAITING", 13f, green, true).apply { gravity = Gravity.CENTER }
            c.addView(liveStatus)
            c.addView(space(10))
            liveQuestion = text(message, 21f, navy, true).apply { gravity = Gravity.CENTER; setPadding(dp(8), dp(4), dp(8), dp(8)) }
            c.addView(liveQuestion)
            c.addView(text("The app stays here while the website Admin controls the same live competition.", 12f, muted).apply { gravity = Gravity.CENTER })
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
        content.addView(text(activeQuiz["name"].stringOr("Quiz Competition"), 22f, navy, true))
        content.addView(space(8))
        val timerCard = panel(paleOrange)
        timerCard.orientation = LinearLayout.HORIZONTAL
        timerCard.gravity = Gravity.CENTER_VERTICAL
        timerLabel = text("--", 22f, saffron, true)
        timerCard.addView(text("TIME LEFT", 11f, ink, true), LinearLayout.LayoutParams(0, -2, 1f))
        timerCard.addView(timerLabel)
        content.addView(timerCard, margin(-1, -2, 0, 0, 0, 12))
        val qCard = panel()
        val num = ((activeQuiz["currentIndex"] as? Number)?.toInt() ?: 0) + 1
        val total = (activeQuiz["count"] as? Number)?.toInt() ?: 0
        qCard.addView(text("QUESTION " + num + (if (total > 0) " OF " + total else ""), 11f, saffron, true))
        qCard.addView(space(8))
        liveQuestion = text(localizedQuestion(activeQuestion, "question"), 22f, navy, true)
        liveQuestion?.setLineSpacing(dp(2).toFloat(), 1f)
        qCard.addView(liveQuestion)
        qCard.addView(space(12))
        answerButtons.clear()
        val options = localizedOptions(activeQuestion)
        for (i in 0 until minOf(4, options.size)) {
            val b = Button(this).apply {
                text = ('A' + i) + ". " + options[i]
                textSize = 15f
                isAllCaps = false
                gravity = Gravity.CENTER_VERTICAL
                setTextColor(navy)
                background = rounded(paper, 14, 0xFFD7DFEA.toInt())
                setPadding(dp(14), dp(12), dp(14), dp(12))
                isEnabled = !answerLocked
                setOnClickListener { submitAnswer(i) }
            }
            answerButtons += MaterialButtonRef(b, i)
            qCard.addView(b, margin(-1, dp(54), 0, 0, 0, 8))
        }
        questionFeedback = text(if (answerLocked) "Your answer is already submitted for this question." else "Choose one answer. You can submit only once per question.", 12f, muted)
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
        content.addView(text("Quiz Completed", 27f, navy, true))
        content.addView(space(12))
        val c = panel()
        c.gravity = Gravity.CENTER_HORIZONTAL
        c.addView(text("🏆", 48f, gold, true).apply { gravity = Gravity.CENTER })
        c.addView(text("Thank you for participating!", 20f, navy, true).apply { gravity = Gravity.CENTER })
        c.addView(text("Your answers have been shared with the same competition Admin. Results will follow the website's existing result process.", 13f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(8))
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
        content.addView(text(title, 24f, navy, true))
        content.addView(space(10))
        content.addView(panel().apply { addView(text(body, 15f, ink)) })
        content.addView(secondaryButton("Back") {
            when {
                title.contains("Notice", true) -> showNotices()
                title.contains("Event", true) -> showEvents()
                title.contains("Activity", true) -> showActivities()
                else -> showProfile()
            }
        }, margin(-1, dp(48), 0, 12, 0, 0))
    }

    private fun sectionHeading(title: String, action: String, click: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(text(title, 18f, navy, true), LinearLayout.LayoutParams(0, -2, 1f))
            addView(text(action, 12f, saffron, true).apply { setOnClickListener { click() } })
        }

    private fun actionCard(icon: String, title: String, body: String, bg: Int, click: () -> Unit): LinearLayout {
        val c = panel()
        c.setPadding(dp(12), dp(12), dp(12), dp(12))
        c.addView(text(icon, 24f, if (bg == paleGreen) green else saffron, true))
        c.addView(space(7))
        c.addView(text(title, 14f, navy, true))
        c.addView(space(3))
        c.addView(text(body, 11f, muted))
        c.setOnClickListener { click() }
        return c
    }

    private fun contentCard(title: String, body: String, meta: String, icon: String, click: () -> Unit): LinearLayout {
        val c = panel()
        c.orientation = LinearLayout.HORIZONTAL
        c.gravity = Gravity.CENTER_VERTICAL
        val iconBox = TextView(this).apply {
            text = icon
            textSize = 25f
            gravity = Gravity.CENTER
            background = rounded(paleOrange, 14)
        }
        c.addView(iconBox, LinearLayout.LayoutParams(dp(54), dp(54)))
        val info = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12), 0, 0, 0) }
        info.addView(text(title, 15f, navy, true))
        if (meta.isNotBlank()) info.addView(text(meta, 11f, green, true).apply { setPadding(0, dp(3), 0, dp(3)) })
        info.addView(text(body, 12f, muted))
        c.addView(info, LinearLayout.LayoutParams(0, -2, 1f))
        c.setOnClickListener { click() }
        return c
    }

    private fun emptyCard(message: String): View = panel().apply {
        addView(text(message, 13f, muted))
    }

    private fun panel(bg: Int = paper): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(16), dp(16), dp(16))
        background = rounded(bg, 20, 0xFFE9E2D4.toInt())
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
