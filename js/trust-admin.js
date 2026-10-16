import {auth,db} from "./firebase.js";
import {GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,getIdTokenResult} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {collection,doc,getDoc,getDocs,addDoc,setDoc,deleteDoc,serverTimestamp,onSnapshot} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id), ROOT="rohit.fcg123@gmail.com";
let allowed=false, unsubs=[];
function status(msg,error=false){$("writeStatus").textContent=msg;$("writeStatus").style.background=error?"#fde8e8":"#eaf3ff";$("writeStatus").style.color=error?"#8c2026":"#102f5d";}
function authStatus(msg,error=false){$("authStatus").textContent=msg;$("authStatus").style.background=error?"#fde8e8":"#eaf3ff";$("authStatus").style.color=error?"#8c2026":"#102f5d";}
function normalized(user){return String(user?.email||"").trim().toLowerCase()}
async function check(user){
 if(!user?.email) throw new Error("Sign in with an approved Google Admin account.");
 const token=await getIdTokenResult(user);
 if(token.claims.firebase?.sign_in_provider!=="google.com")throw new Error("Only Google sign-in is supported.");
 const email=normalized(user);
 if(email===ROOT)return;
 const snap=await getDoc(doc(db,"approvedAdminEmails",email));
 if(!snap.exists()||snap.data()?.active!==true)throw new Error("This Google account is not approved by the Root Admin.");
}
function showAdmin(){allowed=true;$("loginCard").classList.add("hidden");$("adminContent").classList.remove("hidden");subscribeLists();loadContact();}
function safe(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function renderList(target,items,kind){
 const host=$(target);host.innerHTML="";
 if(!items.length){host.textContent="No published items yet.";return}
 items.forEach(item=>{
  const row=document.createElement("div");row.className="entry";
  row.innerHTML='<div class="copy"><strong>'+safe(item.title||kind)+'</strong><p>'+safe(item.body||item.description||"")+'</p><small>'+safe(item.category||"General")+'</small></div><button type="button" class="danger">Delete</button>';
  row.querySelector("button").addEventListener("click",async()=>{if(!confirm("Permanently delete this "+kind.toLowerCase()+"?"))return;try{await deleteDoc(doc(db,kind==="Notice"?"trustNotices":kind==="Event"?"trustEvents":"trustActivities",item.id));status(kind+" deleted.")}catch(e){status("Delete failed: "+e.message,true)}});
  host.appendChild(row);
 });
}
function subscribeLists(){
 unsubs.forEach(f=>f());unsubs=[];
 [["trustNotices","noticeList","Notice"],["trustEvents","eventList","Event"],["trustActivities","activityList","Activity"]].forEach(([col,target,kind])=>{
  unsubs.push(onSnapshot(collection(db,col),snap=>{
   const docs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.status==null||d.status==="published");
   renderList(target,docs,kind);
  },e=>status("Could not load "+kind+"s: "+e.message,true)));
 });
}
function clean(value){return String(value||"").trim()}
function submit(formId,collectName,makeData){
 $(formId).addEventListener("submit",async event=>{
  event.preventDefault();
  if(!allowed||!auth.currentUser){status("Sign in as an approved Admin first.",true);return}
  const data=makeData();
  try{await addDoc(collection(db,collectName),{...data,status:"published",publishedAt:serverTimestamp(),createdBy:normalized(auth.currentUser)});$(formId).reset();status("Published successfully. It will appear in the app after Firebase sync.");}
  catch(e){status("Publish failed: "+e.message+" Check whether the latest Firestore rules have been published.",true)}
 });
}
submit("noticeForm","trustNotices",()=>({title:clean($("noticeTitle").value),body:clean($("noticeBody").value),category:clean($("noticeCategory").value),pinned:$("noticePinned").checked}));
submit("eventForm","trustEvents",()=>({title:clean($("eventTitle").value),description:clean($("eventDescription").value),dateText:clean($("eventDate").value),location:clean($("eventLocation").value),category:clean($("eventCategory").value)}));
submit("activityForm","trustActivities",()=>({title:clean($("activityTitle").value),description:clean($("activityDescription").value),category:clean($("activityCategory").value),imageUrl:clean($("activityImage").value)}));
async function loadContact(){
 try{const snap=await getDoc(doc(db,"trustInfo","contact"));if(!snap.exists())return;const d=snap.data();$("contactAbout").value=d.about||"";$("contactMission").value=d.mission||"";$("contactPhone").value=d.phone||"";$("contactEmail").value=d.email||"";$("contactAddress").value=d.address||"";$("contactUpi").value=d.upiId||"";}catch(e){status("Contact settings not loaded: "+e.message,true)}
}
$("contactForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!allowed)return;
 const upi=clean($("contactUpi").value);
 if(upi&&!/^[\w.-]+@[\w.-]+$/.test(upi)){status("Enter a valid UPI ID or leave the field blank.",true);return}
 try{await setDoc(doc(db,"trustInfo","contact"),{about:clean($("contactAbout").value),mission:clean($("contactMission").value),phone:clean($("contactPhone").value),email:clean($("contactEmail").value),address:clean($("contactAddress").value),upiId:upi,updatedAt:serverTimestamp(),updatedBy:normalized(auth.currentUser)},{merge:true});status("Trust details saved.")}catch(err){status("Save failed: "+err.message+" Check Firestore Rules.",true)}
});
$("loginBtn").addEventListener("click",async()=>{
 try{const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});const result=await signInWithPopup(auth,provider);await check(result.user);showAdmin();authStatus("Authorized Admin session.");}
 catch(e){authStatus(e.message||"Login failed.",true);if(e.message?.includes("not approved"))try{await signOut(auth)}catch{}}
});
$("logoutBtn").addEventListener("click",async()=>{unsubs.forEach(f=>f());unsubs=[];await signOut(auth);allowed=false;$("adminContent").classList.add("hidden");$("loginCard").classList.remove("hidden");authStatus("Logged out.")});
onAuthStateChanged(auth,async user=>{
 if(!user){allowed=false;$("adminContent").classList.add("hidden");$("loginCard").classList.remove("hidden");authStatus("Sign in with an approved Google Admin account.");return}
 try{await check(user);showAdmin();authStatus("Authorized Admin session.");}
 catch(e){allowed=false;$("adminContent").classList.add("hidden");$("loginCard").classList.remove("hidden");authStatus(e.message,true)}
});
