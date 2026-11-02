/** Search-intent guides. Each one targets a single question job seekers type, opens with a direct answer, and links on to the product. */
export type Guide = {
  slug: string;
  /** <title> without the site suffix. Kept under ~60 characters with the suffix added. */
  title: string;
  h1: string;
  description: string;
  /** Primary query this guide should answer. Documentation only; never rendered. */
  keyword: string;
  /** The 40–60 word answer shown first, written to be quoted by search and answer engines. */
  answer: string;
  sections: { heading: string; body: string[]; list?: string[] }[];
  faq: { q: string; a: string }[];
  related: string[];
  published: string;
  modified: string;
};

export const GUIDES: Guide[] = [
  {
    slug: "find-jobs-that-match-your-cv",
    title: "How to Find Jobs That Match Your CV",
    h1: "How to find jobs that match your CV",
    description: "A practical way to turn your CV into a job search: pull out your skills, set realistic filters, and check each vacancy against evidence before you apply.",
    keyword: "find jobs that match my CV",
    answer:
      "To find jobs that match your CV, list the skills and results your CV can prove, choose the job titles and locations you will accept, then compare each vacancy’s requirements with that evidence. Apply first to roles where most requirements are already shown on your CV.",
    sections: [
      {
        heading: "Start with what your CV can prove",
        body: [
          "A job search built on titles alone returns a lot of noise. Start instead with the skills, tools, results and responsibilities your CV already shows. These are the facts an employer can verify, and they decide how well you fit a role.",
          "Read your CV as a recruiter would and write down five to eight things you could back up in an interview. Include tools, domain knowledge and measurable outcomes, not only job titles.",
        ],
      },
      {
        heading: "Set filters that reflect your real situation",
        body: ["Decide the constraints before you search so you do not waste time on roles you cannot take. Be specific about each of these:"],
        list: [
          "Job titles you want, and similar titles you would also accept",
          "Cities, regions or countries, and whether you want on-site, hybrid or remote work",
          "The countries where you are legally allowed to work, and whether you need visa sponsorship",
          "Employment type: full-time, part-time, contract, graduate scheme or internship",
        ],
      },
      {
        heading: "Compare each vacancy with your evidence",
        body: [
          "Open the vacancy and mark its must-have requirements. For each one, check whether your CV already shows it. Requirements you can point to are strengths. Requirements missing from your CV are gaps you should either close or leave out of your claims.",
          "Sort roles into three groups: a strong fit where most must-haves are shown, a stretch where a few are missing, and a poor fit. Spend your tailoring time on the first two groups.",
        ],
      },
      {
        heading: "Check eligibility details before you invest time",
        body: [
          "Many applications fail for reasons unrelated to skill: a location restriction, a sponsorship rule or a required language. Read for these early. If a vacancy is unclear, plan to ask rather than assume.",
        ],
      },
      {
        heading: "Repeat it on a schedule",
        body: [
          "New vacancies appear daily and many close within weeks. A short, repeated check of the same trusted sources works better than an occasional long search. Shortlist Job Radar automates this step: it compares public vacancies with your CV and preferences and explains each match, while you review and apply yourself.",
        ],
      },
    ],
    faq: [
      { q: "Can software find jobs that match my CV?", a: "Yes. Tools such as Shortlist Job Radar read your CV and saved preferences, compare them with public vacancies and show the evidence behind each match. You still decide which jobs to apply for and submit every application yourself." },
      { q: "What if my CV does not match any job exactly?", a: "Few CVs match perfectly. Aim for roles where most must-have requirements are shown, and be honest about gaps. A stretch role can still be worth applying to if your evidence is strong in the areas that matter most." },
      { q: "Should I use the same CV for every job?", a: "Keep one master CV of facts, then reorder and reword it for each application so the most relevant evidence comes first. Never add skills or experience you do not have." },
    ],
    related: ["tailor-your-cv-to-a-job-description", "ats-friendly-cv", "how-to-track-job-applications"],
    published: "2026-11-02",
    modified: "2026-11-02",
  },
  {
    slug: "tailor-your-cv-to-a-job-description",
    title: "How to Tailor Your CV to a Job Description",
    h1: "How to tailor your CV to a job description",
    description: "Tailor your CV to each job without inventing anything: read the requirements, match them to your evidence, and reorder your strongest proof to the top.",
    keyword: "how to tailor a CV to a job description",
    answer:
      "To tailor your CV to a job description, identify the employer’s must-have requirements, find where your real experience shows each one, then move that evidence to the top and use the employer’s own wording. Remove or shorten anything unrelated. Never add skills you do not have.",
    sections: [
      {
        heading: "Read the job description for requirements, not buzzwords",
        body: [
          "Highlight the responsibilities and must-have skills, usually listed near the top or under “requirements”. Separate them from nice-to-haves. Repeated terms signal what matters most to the employer.",
        ],
      },
      {
        heading: "Map each requirement to evidence in your CV",
        body: ["Create a simple two-column list: the requirement on the left and your proof on the right. Good proof is specific:"],
        list: ["A project or responsibility that used the skill", "A result with a number, such as time saved or revenue supported", "A tool, qualification or certification you actually hold"],
      },
      {
        heading: "Reorder first, rewrite second",
        body: [
          "The fastest improvement is usually order. Put the most relevant role, project or achievement first, and make sure your summary mentions the target role. Then reword bullet points to use the employer’s terminology where it describes the same thing you did.",
        ],
      },
      {
        heading: "Do not cross the line into invention",
        body: [
          "Adding a tool you never used, or inflating a title, can get an offer withdrawn and fails at interview. Rewording describes the same facts in the employer’s language. Inventing creates new facts. Only the first is tailoring.",
        ],
      },
      {
        heading: "Keep a master CV",
        body: [
          "Store every role, project and result in one master CV. For each application, copy it and keep only what is relevant. Shortlist Job Radar does this with a safeguard: every suggested change is checked against your own CV, and anything that adds a new employer, title, number, tool or qualification is blocked.",
        ],
      },
    ],
    faq: [
      { q: "How long does it take to tailor a CV?", a: "A focused edit usually takes 15 to 30 minutes: reading the job, reordering evidence and adjusting the summary. A master CV and a clear requirement-to-evidence list make each later application faster." },
      { q: "Should I copy keywords from the job description?", a: "Use the employer’s terms only where they truthfully describe what you did. Copying keywords for skills you lack is easy for recruiters to spot and weak in interviews." },
      { q: "Is it okay to use AI to tailor my CV?", a: "Yes, if you review every change and the tool only works from facts you provided. Choose tools that check suggestions against your CV rather than adding new claims." },
    ],
    related: ["find-jobs-that-match-your-cv", "ats-friendly-cv", "cover-letter-for-a-specific-job"],
    published: "2026-11-02",
    modified: "2026-11-02",
  },
  {
    slug: "ats-friendly-cv",
    title: "ATS-Friendly CV: What It Is and How to Make One",
    h1: "What is an ATS-friendly CV, and how do you make one?",
    description: "An ATS-friendly CV is one applicant tracking software can read correctly. Learn the layout, file and wording rules that keep your CV readable.",
    keyword: "ATS friendly CV",
    answer:
      "An ATS-friendly CV is formatted so applicant tracking systems can read it accurately: a single column, standard headings, plain text in the file, common fonts and no text inside images. Clear structure and relevant wording help the software, and the recruiter, find your experience.",
    sections: [
      {
        heading: "What an applicant tracking system does",
        body: [
          "Many employers use applicant tracking systems (ATS) to collect applications, extract the text of each CV into fields, and let recruiters search and filter. If the software cannot read your CV properly, your details may be stored wrongly or missed in a search.",
        ],
      },
      {
        heading: "Layout rules that keep a CV readable",
        body: ["Most reading problems come from design, not content. Prefer a plain structure:"],
        list: [
          "One main column, with sections in a logical top-to-bottom order",
          "Standard headings such as Experience, Education and Skills",
          "Common fonts at a readable size, with real text rather than images of text",
          "Dates and job titles written consistently on their own lines",
          "Avoid tables, text boxes, icons for contact details and information in headers or footers",
        ],
      },
      {
        heading: "File format",
        body: [
          "A text-based PDF or a Word document is normally safe. If an employer states a preferred format, follow it. Avoid scanned images of a CV because the text cannot be extracted.",
        ],
      },
      {
        heading: "Wording matters as much as format",
        body: [
          "Use the job’s own terms where they truthfully describe your experience, for example the exact name of a tool or qualification. Spell out abbreviations once. This helps both software and the person who reads the CV next.",
        ],
      },
      {
        heading: "Pretty templates can still be a trade-off",
        body: [
          "Designed layouts with columns and graphics look distinctive but may read less reliably in some systems. Shortlist Job Radar’s free CV templates are each labelled for how readable they are to applicant tracking systems, so you can pick the right balance for the role.",
        ],
      },
    ],
    faq: [
      { q: "Do all companies use an ATS?", a: "Many mid-size and large employers do, and some small ones too. Because you rarely know in advance, a clean, readable CV is a safe default." },
      { q: "Does an ATS automatically reject CVs?", a: "Many systems mainly store and organise applications for recruiters to search. Some employers add screening questions or ranking rules, so a CV that clearly shows required skills and eligibility helps." },
      { q: "Is a PDF or Word file better?", a: "A text-based PDF or Word file both work in most systems. Follow the employer’s instructions when they state a format." },
    ],
    related: ["tailor-your-cv-to-a-job-description", "find-jobs-that-match-your-cv", "cover-letter-for-a-specific-job"],
    published: "2026-11-02",
    modified: "2026-11-02",
  },
  {
    slug: "cover-letter-for-a-specific-job",
    title: "How to Write a Cover Letter for a Specific Job",
    h1: "How to write a cover letter for a specific job",
    description: "Write a short, specific cover letter that links the employer’s needs to your real experience, with a simple structure you can reuse for every application.",
    keyword: "how to write a cover letter for a job",
    answer:
      "To write a cover letter for a specific job, open with the role and why it interests you, give two or three examples from your experience that match the employer’s main requirements, and close with a clear next step. Keep it to one page and avoid repeating your whole CV.",
    sections: [
      {
        heading: "Keep the structure simple",
        body: ["A reliable cover letter has four short parts:"],
        list: [
          "Opening: the role you are applying for and one sentence on why it fits you",
          "Evidence: two or three examples that match the employer’s top requirements",
          "Motivation: something specific about the company or team that is true for you",
          "Close: thanks, availability and a polite request to talk",
        ],
      },
      {
        heading: "Lead with the employer’s needs",
        body: [
          "Read the vacancy and pick the two or three requirements that matter most. For each, give a concrete example from your CV with the outcome. This is more convincing than general claims about being hardworking or passionate.",
        ],
      },
      {
        heading: "Address a real person where you can",
        body: [
          "If the vacancy names a hiring manager or recruiter, address them. If not, “Dear hiring team” is fine. Check the company name and role title carefully, because errors there are the quickest way to look careless.",
        ],
      },
      {
        heading: "Stay truthful",
        body: [
          "Every claim in a cover letter should be something you can discuss in an interview. Shortlist Job Radar drafts letters only from the facts in your CV and flags anything that would add a claim you did not provide.",
        ],
      },
    ],
    faq: [
      { q: "How long should a cover letter be?", a: "About 250 to 350 words, or roughly three to four short paragraphs on one page." },
      { q: "Do I need a cover letter if it is optional?", a: "A short, specific letter can set you apart when the employer receives many similar CVs. If you have little time, prioritise a well-tailored CV first." },
      { q: "Can I reuse one cover letter?", a: "Reuse the structure, not the text. Change the role, the company details and the examples so the letter clearly addresses that vacancy." },
    ],
    related: ["tailor-your-cv-to-a-job-description", "follow-up-after-a-job-application", "prepare-for-a-job-interview"],
    published: "2026-11-02",
    modified: "2026-11-02",
  },
  {
    slug: "how-to-track-job-applications",
    title: "How to Track Job Applications (Simple System)",
    h1: "How to track job applications",
    description: "Track every application with a simple system: what to record, which statuses to use, and when to follow up so no opportunity slips through.",
    keyword: "how to track job applications",
    answer:
      "To track job applications, record the company, role, link, date applied, the CV version you sent and the current status for every application, then review the list weekly. Set a follow-up date for each one so no application is forgotten.",
    sections: [
      {
        heading: "What to record for each application",
        body: ["Keep the same fields every time so the list stays easy to scan:"],
        list: [
          "Company, role title and a link to the original vacancy",
          "Date applied and the deadline, if there is one",
          "Which CV and cover letter version you sent",
          "Contact name, status and the next action with a date",
        ],
      },
      {
        heading: "Use a small set of statuses",
        body: [
          "Too many statuses make a tracker tiring to maintain. Saved, Applied, Interviewing, Offer and Closed cover most searches. Move a job forward the moment something changes.",
        ],
      },
      {
        heading: "Save the vacancy text",
        body: [
          "Vacancies are often removed once a role is filled. Save the description when you apply so you can prepare for interviews later and remember what the employer asked for.",
        ],
      },
      {
        heading: "Review weekly and follow up",
        body: [
          "Once a week, scan for applications with no reply after seven to ten days and send a short, polite follow-up. Shortlist Job Radar keeps jobs, documents, statuses and reminders in one place so the weekly review takes minutes.",
        ],
      },
    ],
    faq: [
      { q: "Is a spreadsheet enough to track applications?", a: "Yes, for a small search. A dedicated tool becomes useful when you need to keep tailored documents, reminders and interview notes together." },
      { q: "How many applications should I track?", a: "Track all of them, including ones you saved but did not send. The record helps you see which kinds of roles lead to interviews." },
    ],
    related: ["follow-up-after-a-job-application", "find-jobs-that-match-your-cv", "prepare-for-a-job-interview"],
    published: "2026-11-02",
    modified: "2026-11-02",
  },
  {
    slug: "follow-up-after-a-job-application",
    title: "How to Follow Up After a Job Application",
    h1: "How to follow up after a job application",
    description: "When and how to follow up on a job application, with a short polite email structure that keeps you visible without being pushy.",
    keyword: "how to follow up after applying for a job",
    answer:
      "To follow up after a job application, wait about a week or until the date the employer gave, then send a short, polite email to the recruiter or hiring contact. Mention the role, restate one relevant strength and ask whether there is an update. Send at most one or two follow-ups.",
    sections: [
      {
        heading: "When to follow up",
        body: [
          "If the vacancy gave a decision date, wait until it passes. Otherwise, a week to ten days after applying is a reasonable point. Following up earlier can look impatient, and waiting much longer can lose the moment.",
        ],
      },
      {
        heading: "What to include",
        body: ["Keep it short enough to read on a phone:"],
        list: [
          "A clear subject line with the role title",
          "One sentence that you applied and remain interested",
          "One specific reason you are a strong fit",
          "A polite question about the status or next steps",
        ],
      },
      {
        heading: "Who to send it to",
        body: [
          "Use the contact named in the vacancy. If there is none, a recruiter or the hiring manager found through the company’s public page is reasonable. Do not send the same message to several people at once.",
        ],
      },
      {
        heading: "If there is still no reply",
        body: [
          "Send one further note after another week, then move on. Silence is common and often says nothing about your CV. Keep applying elsewhere. Shortlist Job Radar reminds you when an application has had no answer and prepares a polite draft you can edit and send.",
        ],
      },
    ],
    faq: [
      { q: "Is it rude to follow up?", a: "No. A brief, polite message shows genuine interest. It becomes a problem only when it is repeated too often or sounds demanding." },
      { q: "Should I follow up by email or phone?", a: "Email is usually best unless the employer asked you to call. It is easy to answer and keeps a record." },
    ],
    related: ["how-to-track-job-applications", "cover-letter-for-a-specific-job", "prepare-for-a-job-interview"],
    published: "2026-11-02",
    modified: "2026-11-02",
  },
  {
    slug: "prepare-for-a-job-interview",
    title: "How to Prepare for a Job Interview",
    h1: "How to prepare for a job interview",
    description: "Prepare for an interview in a structured way: research the role, prepare examples from your CV, practise answers aloud and plan your own questions.",
    keyword: "how to prepare for a job interview",
    answer:
      "To prepare for a job interview, study the job description and the company, prepare four to six examples from your experience using the situation-action-result format, practise your answers aloud, and write down questions to ask the interviewer. Check logistics the day before.",
    sections: [
      {
        heading: "Research the role and the company",
        body: [
          "Re-read the vacancy and list what the employer needs most. Then look at the company’s website and recent public news so you can explain why you want this role there in specific terms.",
        ],
      },
      {
        heading: "Prepare examples, not scripts",
        body: [
          "Pick four to six experiences from your CV that cover teamwork, problem solving, pressure, initiative and results. For each, be ready to explain the situation, what you did and what happened. Examples are more flexible than memorised answers.",
        ],
      },
      {
        heading: "Practise answers out loud",
        body: [
          "Saying answers aloud exposes unclear points that silent reading hides. Time yourself: most answers work best at one to two minutes. Shortlist Job Radar generates likely questions from the job description and your CV and gives feedback on your practice answers.",
        ],
      },
      {
        heading: "Prepare your questions",
        body: ["Interviews are two-way. Prepare questions such as:"],
        list: ["What does success look like in the first six months?", "How is the team organised, and who would I work with most?", "What are the next steps and the expected timeline?"],
      },
    ],
    faq: [
      { q: "How early should I start preparing?", a: "Ideally a few days before, so you can practise more than once. If the notice is short, focus on the job description, three strong examples and your questions." },
      { q: "What if I do not know an answer?", a: "Say so calmly, explain how you would approach it and give a related example. Honesty combined with clear thinking is better than guessing." },
    ],
    related: ["cover-letter-for-a-specific-job", "follow-up-after-a-job-application", "find-jobs-that-match-your-cv"],
    published: "2026-11-02",
    modified: "2026-11-02",
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
