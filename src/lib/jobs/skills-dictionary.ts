/**
 * Common skills across many kinds of work, used to spot keywords when no AI key is set.
 * Not exhaustive: with an AI key configured, keywords come from the post itself.
 */
export const SKILL_TERMS = [
  // Software and data
  "JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "C", "R", "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin", "SQL", "HTML", "CSS",
  "React", "Next.js", "Vue", "Angular", "Svelte", "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring", ".NET", "Laravel", "Rails",
  "GraphQL", "REST", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Kafka", "Docker", "Kubernetes", "Terraform",
  "AWS", "Azure", "Google Cloud", "Linux", "Git", "CI/CD", "Jest", "Playwright", "Cypress", "Tailwind", "Figma", "Sketch",
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas", "NumPy", "Power BI", "Tableau", "Excel", "Looker",
  "Data Analysis", "Data Visualization", "Statistics", "A/B testing", "ETL", "Snowflake", "BigQuery", "Spark", "Airflow",
  "Android", "iOS", "React Native", "Flutter", "Unity",
  // Design, marketing, content
  "UX", "UI", "User Research", "Wireframing", "Prototyping", "Adobe Photoshop", "Adobe Illustrator", "InDesign", "Canva",
  "SEO", "SEM", "Google Ads", "Google Analytics", "Social Media", "Content Marketing", "Email Marketing", "Copywriting", "HubSpot",
  "Mailchimp", "WordPress", "Shopify", "Video Editing", "Premiere Pro", "Photography",
  // Business, sales, operations
  "Project Management", "Agile", "Scrum", "Jira", "Stakeholder Management", "Product Management", "Roadmapping",
  "Salesforce", "CRM", "B2B", "B2C", "Lead Generation", "Cold Calling", "Negotiation", "Account Management", "Customer Service",
  "Customer Success", "Zendesk", "Supply Chain", "Logistics", "Procurement", "Inventory Management", "Operations",
  "Budgeting", "Forecasting", "Financial Modelling", "Accounting", "Bookkeeping", "QuickBooks", "Xero", "Tally", "SAP", "IFRS",
  "Auditing", "Payroll", "Taxation", "Recruitment", "Onboarding", "HR", "Training", "Public Speaking", "Presentation",
  "Microsoft Office", "Word", "PowerPoint", "Google Workspace", "Data Entry", "Scheduling", "Administration",
  // Care, hospitality, trades, education
  "Patient Care", "Nursing", "First Aid", "CPR", "Pharmacy", "Caregiving", "Food Safety", "Food Hygiene", "Cooking",
  "Housekeeping", "Front Desk", "Hospitality", "Barista", "Retail", "Cash Handling", "Point of Sale", "Merchandising",
  "Driving License", "Forklift", "Welding", "Electrical", "Plumbing", "Carpentry", "Construction", "Health and Safety",
  "Teaching", "Lesson Planning", "Classroom Management", "Tutoring", "Curriculum Development",
  // Languages and soft skills that posts often require by name
  "English", "Nepali", "Hindi", "Arabic", "Japanese", "Korean", "German", "French", "Spanish", "Mandarin",
  "Communication", "Teamwork", "Leadership", "Problem Solving", "Time Management", "Attention to Detail",
] as const;
