# Sentricol - Cybersecurity Training Game: Complete App Analysis

## 🎮 Project Overview
**Sentr** is a 2D cybersecurity training game that transforms boring awareness courses into engaging investigations. It gamifies cybersecurity training by presenting users with realistic email phishing scenarios, password strength assessments, and data classification tasks.

**Tech Stack:**
- **Framework:** Next.js 16.2.6 (App Router)
- **React:** v19 (latest with Server Components support)
- **Styling:** Tailwind CSS v4.2.0 + shadcn/ui (base-nova preset)
- **UI Components:** Base UI React v1.5.0, shadcn components
- **Icons:** Lucide React v1.16.0
- **Date/Time:** dayjs v1.11.21
- **Analytics:** Vercel Analytics v1.6.1

---

## 📊 Core Game Mechanics

### Game State Structure
The app uses a central `GameState` that tracks:
- **graduationProgress**: Progress bar (0-100%), increases with correct decisions
- **currentTaskType**: 'email' | 'password' | 'data-classification'
- **currentEmailId/currentPasswordId/currentDocumentId**: Currently selected task ID
- **investigatedCategories**: Set of email clue categories the user checked (Profile, Link, File, Language, Context, Request)
- **decision**: User's phishing classification ('legitimate' | 'phishing' | null)
- **day**: Current day number (starts at 7)
- **todaysTasksCompleted**: Tasks completed on current day (max 10)
- **dispatchQueue**: Queue of incoming incidents (email, password, or data classification tasks)

### Three Task Types

#### 1. Email Investigation (Primary Task)
- **Component:** `EmailInbox.tsx` + `EmailViewer.tsx` + `InvestigationPanel.tsx`
- **Flow:**
  1. User selects an email from inbox list
  2. Email viewer displays: sender, domain, subject, body, attachments
  3. User investigates 6 clue categories (checkboxes in InvestigationPanel):
     - Profile: Sender email verification
     - Link: URL analysis
     - File: Attachment analysis
     - Language: Grammar/tone analysis
     - Context: Email context validation
     - Request: Type of request analysis
  4. User makes decision: "Phishing" or "Legitimate"
  5. Feedback modal shows:
     - Whether decision was correct
     - Progress reward (1-5% based on investigation thoroughness)
     - Detailed explanation of threat indicators

**Reward System:**
- Correct decision + 50%+ clues investigated = +5%
- Correct decision + some investigation = +2%
- Correct guess (no investigation) = +1%
- Incorrect decision = 0%

#### 2. Password Strength Assessment
- **Component:** `PasswordStrengthTask.tsx` + `PasswordFeedbackModal.tsx`
- **Password Characteristics Checked:**
  - Minimum 12 characters
  - Character diversity (upper, lower, numbers, symbols)
  - Dictionary words (red flag)
  - Sequential numbers (red flag)
  - Keyboard patterns (red flag)
  - Personal information
  - Company name
  - Known leaked passwords

**User Decision:** 'approve' | 'revision' | 'reject'
- Correct decision = +5%
- Each password has correct answer stored in mock data

#### 3. Data Classification
- **Component:** `DataClassificationTask.tsx` + `DataClassificationFeedbackModal.tsx`
- **Classification Levels:**
  - **Public**: Can be shared externally
  - **Internal**: Company-only but not sensitive
  - **Confidential**: Board-level/executive info
  - **Restricted**: PII, API keys, customer data

**User Decision:** Classify document into one of 4 categories
- Correct classification = +5%

---

## 📁 Project Structure

```
/vercel/share/v0-project/
├── app/
│   ├── layout.tsx          # Root layout with metadata, Analytics, dark theme
│   ├── page.tsx            # Main game component (1000+ lines, all game logic)
│   └── globals.css         # Tailwind v4 CSS with design tokens
├── components/
│   ├── Header.tsx          # Top bar with time, progress bar, settings/help
│   ├── TasksPanel.tsx      # Left sidebar: task type selector with notification badge
│   ├── ProgressPanel.tsx   # Left sidebar: progress display placeholder
│   ├── EmailInbox.tsx      # Email list sidebar
│   ├── EmailViewer.tsx     # Email detail view with clue categories
│   ├── InvestigationPanel.tsx # Right sidebar: clue checklist + decision buttons
│   ├── EmployeeHandbook.tsx # (Currently hidden/unused)
│   ├── PasswordStrengthTask.tsx # Password review UI with characteristic checkboxes
│   ├── DataClassificationTask.tsx # Document classification UI
│   ├── DecisionModal.tsx   # Confirmation before making email decision
│   ├── FeedbackModal.tsx   # Email decision feedback with explanation
│   ├── PasswordFeedbackModal.tsx # Password assessment feedback
│   ├── DataClassificationFeedbackModal.tsx # Data classification feedback
│   ├── ContactModal.tsx    # Contact verification helper (IT, HR, etc.)
│   ├── DeskUI.tsx          # Bottom persistent desk with handbook, messages, end day button
│   └── ui/button.tsx       # shadcn button component
├── lib/
│   ├── types.ts            # TypeScript interfaces for Email, Password, GameState, etc.
│   ├── gameHelpers.ts      # Utility functions (randomization, notification sound, incident generation)
│   ├── mockEmails.ts       # 5 mock emails with phishing/legitimate mix + verification contacts
│   ├── mockPasswords.ts    # 3 mock passwords for assessment
│   ├── mockDataClassification.ts # 6 mock documents for classification
│   └── utils.ts            # (Empty, for future utilities)
├── public/                 # Static assets (icons, images)
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config with @ alias
├── next.config.mjs         # Next.js config (unoptimized images, ignore build errors)
├── components.json         # shadcn config (base-nova style, lucide icons)
└── postcss.config.mjs      # PostCSS config for Tailwind
```

---

## 🎨 Design & Styling

### Color Scheme (Dark Theme)
- **Background:** `#1a1a1a` (dark)
- **Foreground:** `#e5e5e5` (light gray)
- **Card/Secondary:** `#242424` / `#333333`
- **Primary/Accent:** `#ff8c00` (orange)
- **Destructive:** `#ff4444` (red)
- **Border:** `#333333`
- **Muted:** `#444444` / `#999999`

### Typography
- **Body Font:** Uses CSS variable `--font-body` (standard)
- **Pixel/Retro Font:** `ui-font` class for UI labels (game aesthetic)
- Tailwind v4 with CSS variables in `globals.css`

### Layout Architecture
- **Main Container:** Full-screen flex layout (`h-screen`)
- **Header:** Top border bar with time, progress, buttons
- **Main Content:** 3-column layout with flex gaps
  - **Left Sidebar:** Task selector + progress (fixed width: `w-56`)
  - **Center:** Task-specific content (flex-1, takes remaining space)
  - **Right Sidebar:** Investigation panel (email tasks only)
- **Bottom:** Persistent desk UI (fixed `h-40`)

### Responsive Design
- Mobile-first approach with Tailwind
- Limited responsive breakpoints (mostly desktop-focused)
- Fixed layout dimensions for game-like feel

---

## 🔄 Data Flow & Game Loop

### Initialization
1. `page.tsx` mounts with initial `GameState`:
   - graduationProgress: 35%
   - currentTaskType: 'email'
   - currentEmailId: 'email-1'
   - day: 7
   - tasksCompleted: 0

2. Time updates every minute (client-side only)

3. Incident generation timer starts:
   - Every 3-10 seconds, generates random incident
   - Adds to `dispatchQueue`
   - Plays notification sound
   - Max 10 tasks/day

### Email Task Flow
1. User selects email from inbox
2. Investigates clues (checkboxes update `investigatedCategories`)
3. Clicks "Make Decision" button
4. `DecisionModal` appears for confirmation
5. User confirms → `handleMakeDecision()` called
6. Progress calculated based on correctness + investigation
7. `FeedbackModal` shows results + explanation
8. User clicks continue → email removed from active list
9. `todaysTasksCompleted` incremented
10. Next email auto-selected

### Password Task Flow
1. Similar to email but simpler
2. User checks password characteristics
3. Makes decision (approve/revision/reject)
4. Feedback modal shows explanation
5. Moves to next password (cycles)

### Data Classification Flow
1. User views document preview + sensitivity indicators
2. Selects classification (public/internal/confidential/restricted)
3. Feedback modal shows explanation
4. Moves to next document (cycles)

### End Day Flow
1. User clicks "End Day" button on desk UI
2. `handleEndDay()` resets daily state:
   - Increments day
   - Resets todaysTasksCompleted to 0
   - Clears dispatchQueue
   - Resets currentTaskIds to first of each type
   - **Preserves** graduationProgress
3. Active emails refreshed
4. Investigation list cleared

---

## 📧 Mock Data Details

### Emails (5 total)
1. **email-1**: Microsoft Security phishing - fake domain, urgency tactic
2. **email-2**: HR Benefits legitimate - company domain, normal update
3. **email-3**: Q3 Marketing Plan legitimate - colleague, internal
4. **email-4**: PayPal Alert phishing - fake domain, urgency + link
5. **email-5**: Password Reset legitimate - official company domain, HTTPS

**Verification Contacts:** IT Support, Your Supervisor, HR, Finance, Contact Sender Directly

### Passwords (3 total)
1. **pwd-1**: `P@ssword2025` - Contains dictionary word "password" → REVISION
2. **pwd-2**: `BlueMountain#847` - Dictionary words "Blue" and "Mountain" → REVISION
3. **pwd-3**: `qwerty123456` - Keyboard pattern + sequential + weak → REJECT

### Data Classifications (6 total)
1. **doc-1**: Q3 Marketing Plan → INTERNAL
2. **doc-2**: Employee Handbook → INTERNAL (distributed to all)
3. **doc-3**: Customer Database → RESTRICTED (PII)
4. **doc-4**: API Keys/Credentials → RESTRICTED
5. **doc-5**: Blog Post (Public) → PUBLIC
6. **doc-6**: Board Meeting Minutes → CONFIDENTIAL

---

## 🎯 Key Components & Their Responsibilities

### Page Component (`page.tsx`)
- **1000+ lines** of game state management
- Manages all game logic and state updates
- Handles incident generation timer
- Orchestrates all child components
- **Concerns:** Very large file, could be refactored into custom hooks

### Header.tsx
- Displays current time (updates via client-side interval)
- Shows graduation progress bar with percentage
- Settings/Help buttons (non-functional)

### TasksPanel.tsx
- Radio-like selector for task type (Email/Password/DataClassification)
- Shows notification badge count

### ProgressPanel.tsx
- Minimal placeholder component for future progress details

### EmailInbox.tsx
- List of emails filtered by active status
- Click handler to select email
- Shows sender, subject, timestamp

### EmailViewer.tsx
- Full email display (from, domain, to, subject, body)
- Attachment list with details
- Investigate button for each clue category

### InvestigationPanel.tsx
- Checklist of 6 investigation categories
- Each can be manually checked/unchecked
- "Make Decision" button
- "Verify Contact" button (opens ContactModal)

### FeedbackModal.tsx
- Shows correct/incorrect indicator
- Displays email threat type
- Lists clues user should have found
- Shows progress reward

### PasswordStrengthTask.tsx
- Displays password characteristics
- User checks characteristics present
- Approve/Revision/Reject buttons

### DataClassificationTask.tsx
- Shows document preview
- Lists sensitivity indicators
- 4 classification buttons (Public/Internal/Confidential/Restricted)

### DeskUI.tsx
- Fixed bottom desk UI with physical items
- Employee Handbook button (with modal)
- Messages button (with notification badge)
- Notes button
- Coffee mug emoji
- End Day button (main flow trigger)

### ContactModal.tsx
- List of verification contacts
- Click to get help info
- Each contact has role + can help with categories

---

## 🐛 Known Issues & Technical Debt

1. **Large page.tsx file**: 1000+ lines of game logic should be split into custom hooks (`useGameState`, `useEmailTask`, etc.)

2. **Next Build Errors**: `next.config.mjs` has `typescript.ignoreBuildErrors: true` - suggests TypeScript issues not resolved

3. **Unoptimized Images**: `images.unoptimized: true` in config

4. **Unused Component**: `EmployeeHandbook.tsx` component is rendered but commented out in page.tsx

5. **Mock Data Only**: No backend - all data is client-side mock data

6. **No Persistence**: Game progress not saved (resets on refresh)

7. **Limited Responsive Design**: Designed for desktop, may have layout issues on mobile

8. **Accessibility**: Could use more semantic HTML and ARIA labels

---

## 🔌 Environment & Configuration

- **Next.js Version**: 16.2.6 (modern, using Turbopack)
- **React Version**: 19 (latest)
- **Tailwind**: v4 with CSS variables
- **TypeScript**: Enabled but with build error suppression
- **Vercel Analytics**: Included
- **No API Routes**: Fully client-side game

---

## 🎯 Game Progression Mechanics

### Progress Rewards
- **Email Tasks**: 1-5% based on correctness and investigation depth
- **Password Tasks**: 5% for correct decision
- **Data Classification**: 5% for correct classification
- **Max Progress**: 100% (graduation)

### Session Tracking
- Daily task limit: 10 tasks
- Days counter tracks gameplay sessions
- Notification system alerts to new incidents
- Audio feedback (Web Audio API beep)

---

## 🚀 Development Notes

### Running the App
```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
```

### Key Behaviors
1. **Incident Generation**: Every 3-10 seconds until 10 tasks/day completed
2. **Time Display**: Updates every minute (DAY XX • HH:MM AM)
3. **Notification Sound**: Web Audio API sine wave (800Hz, 0.2s)
4. **Investigation Rewards**: Based on thoroughness (0%, 2%, or 5%)

### Future Enhancement Ideas
1. Add database for persistent progress
2. Implement leaderboards
3. Add difficulty levels
4. Create more email scenarios
5. Add multiplayer/team challenges
6. Implement admin dashboard for content management
7. Add unlock system for advanced features
8. Create branching storylines

---

## 📋 Summary

Sentricol is a well-structured, **client-side only** cybersecurity training game built with modern React/Next.js. It successfully gamifies three core security skills: phishing detection, password policy enforcement, and data classification. The app uses a centralized game state in the main page component and mock data for all scenarios. While functional and visually cohesive, it could benefit from component extraction, backend integration for persistence, and improved accessibility.
