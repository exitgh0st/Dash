# Dash — User Guide

**Dash. — Engagement Monitor** is the app the team uses to keep track of Reddit karma-farming work across all our accounts. Each week, every Reddit account is expected to hit a **comment quota** (and a **post quota**). Dash shows, at a glance, which accounts have already hit this week's quota and which still need work — so nobody has to open Reddit and count by hand.

This guide is for the people who actually use Dash. It explains what each screen does and what the numbers mean. No technical background needed.

---

## Two kinds of users

Dash has two types of accounts:

- **Admin** — oversees everyone. Sees every Reddit account across the whole team, adds and manages team members, and sets each person's weekly quotas.
- **Reddit Manager** — operates their own set of Reddit accounts. Sees only their own accounts and how they're tracking against this week's quota.

> **Note:** "Reddit Manager" is the name you'll see on screen for what the team informally calls a *shiller*. Same role, two names.

---

## Getting started

**Getting an account.** You don't sign yourself up. An admin creates your account and gives you an email and password to log in with.

**Logging in.** Go to the app, enter your email and password, and click **Sign in**. If the details are wrong you'll see "Invalid email or password." Once you're in, your session stays logged in until you log out — you won't have to sign in every time.

**Finding your way around.** Every screen has the same layout:

- **Left sidebar** — the main menu: **Dashboard**, **Accounts**, and **Activity History**. Admins also see a **Team & Access** link. Your name, role, and the **Log out** button are at the bottom.
- **Top bar** — shows the name of the page you're on. On the Dashboard it also shows two buttons, **This week** and **Last week**, that switch which week's numbers you're looking at. A week runs **Monday to Sunday**.
- **On a phone** — the sidebar tucks away behind a menu (☰) button in the corner. Tap it to open the menu.

---

## For Reddit Managers

### Your Dashboard

This is your home screen. At the top are **four cards** summarising your week:

- **Comments this week** — how many comments your accounts have made since Monday.
- **Karma this week** — how much karma your accounts have gained this week.
- **Comment quota** — your progress toward this week's comment target, shown as `done / target` with a green bar that fills up as you get closer. The bar stops at full when you hit the target.
- **Post quota** — the same thing for posts.

Below the cards you'll find your **accounts table** (each account, its comments, karma, and status) and a **My recent comments** feed showing your latest comments across all your accounts, newest first. Each one links straight to the comment on Reddit.

### Your Accounts

Open **Accounts** from the sidebar to manage which Reddit accounts you're tracking.

- **Add an account** — click Add, type the Reddit username (for example, `u/example_user`), and confirm. That's it — there's no "log in with Reddit" step. If the username doesn't exist you'll see "No Reddit user found," and if you're already tracking it you'll see "already tracking."
- **Remove an account** — click remove and confirm. Dash stops tracking it.

### Activity History

The **Activity History** page is one combined feed of the most recent comments from all your accounts, newest first, each linking out to Reddit. It's the quickest way to see everything that's happened lately in one place.

### Looking at one account's comments

Click into any account (from your dashboard table) to see just that account's comments. You can use the **date range** picker to narrow the list to a specific stretch of days — handy for checking a particular week.

---

## For Admins

### The overview dashboard

As an admin your dashboard covers the **whole team**. You get the same four cards (Comments, Karma, Comment quota, Post quota) totalled across everyone, plus:

- **Comments by account** — a bar chart comparing how many comments each account made this week.
- **Karma trend** — this week's karma gain next to last week's. (It shows a "collecting data" message until there are two weeks of history to compare.)
- **Managed accounts table** — every account across the team, showing who manages it, its comment count, its karma and the change this week, and its status. Click any row to read that account's comments.

Use the **This week / Last week** buttons in the top bar to switch which week the whole dashboard reflects.

### Team & Access

**Team & Access** (admins only) is where you manage the people on the team.

- **Create** a new member — give them an email and a password (at least 8 characters). They can log in right away.
- **Edit** a member — change their email, set a new password, and set their **weekly comment quota** and **weekly post quota** (these are the per-account targets that drive the quota bars everyone sees). New accounts start at 50 comments and 5 posts per week.
- **Delete** a member — removes them and the Reddit accounts they were tracking. (Admins can't be deleted, including yourself.)
- **Manage** — opens a member's page listing the Reddit accounts they track, each linking to its comments.

---

## Understanding the numbers

- **Karma** — Reddit's score for an account, roughly how much positive attention its posts and comments have earned. Growing karma is the whole point: it makes an account look like a genuine, established user. (Reddit fuzzes the exact number a little, so treat karma as a direction, not an exact count.)
- **Quota** — the target number of comments (and posts) each account should reach in a week. The green progress bar fills as an account gets closer; it stops at full once the target is met.
- **The week** — always **Monday to Sunday**. "This week" means since the most recent Monday.
- **Status colours:**
  - 🟢 **Green** — on track / account healthy.
  - 🟠 **Orange** — behind on the quota, needs more work.
  - 🔴 **Red** — the account is banned, suspended, or couldn't be checked.

---

## Good to know

- **Numbers come live from Reddit**, so a page may take a moment to load while Dash checks each account.
- **As a Reddit Manager you only ever see your own accounts.** Admins see everyone's.
- **There's no "connect with Reddit" step** — you track an account just by its public username.
- **Comments are tracked today; posts are partly there.** You'll see post *quota* progress, but a full feed of individual posts is still coming.
