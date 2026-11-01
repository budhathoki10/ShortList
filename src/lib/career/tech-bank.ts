/**
 * A curated bank of technical interview questions per technology, so practice works without AI.
 * Each question lists what a good answer touches ("expected"), which is also what the plain-code score
 * looks for. Fundamentals suit someone learning or practising a technology; applied questions and the
 * follow-ups an interviewer asks after seeing it on a CV suit someone who has used it.
 */
type Q = [question: string, expected: string[]];
export type TechEntry = { id: string; name: string; aliases: string[]; fundamentals: Q[]; applied: Q[]; followUps: Q[] };

export const TECH_BANK: TechEntry[] = [
  {
    id: "c", name: "C", aliases: ["c"],
    fundamentals: [
      ["What is a pointer in C, and what is the difference between a pointer to an int and an int?", ["A pointer holds a memory address", "Dereferencing with *, taking an address with &", "The pointer's type tells the compiler how to read what it points to"]],
      ["How are arrays and pointers related in C, and where do they differ?", ["An array name usually decays to a pointer to its first element", "sizeof on an array versus on a pointer", "Arrays are not assignable and carry no length"]],
      ["What are the stack and the heap, and which one does malloc use?", ["Locals live on the stack and vanish when the function returns", "malloc allocates on the heap and lives until free", "Stack is automatic and limited, heap is manual"]],
      ["How are strings represented in C, and what goes wrong without the terminator?", ["A char array ending in '\\0'", "strlen counts up to the terminator", "Missing terminator causes reads past the end"]],
    ],
    applied: [
      ["You call malloc and later free the pointer, then use it again. What happens, and how would you prevent or find the bug?", ["Use after free is undefined behaviour", "Set the pointer to NULL after free", "Tools such as Valgrind or AddressSanitizer"]],
      ["Design a small function that copies a string into a buffer safely. What do you check?", ["Buffer size passed in and checked", "Room for the terminator", "Prefer bounded functions and handle truncation"]],
      ["How would you structure a C program split across several files, and what do the compiler and the linker each do?", ["Headers declare, .c files define", "Include guards", "Compile to object files, then link"]],
    ],
    followUps: [
      ["Your CV lists C. What does malloc return when it fails, and how do you handle that?", ["Returns NULL", "Check before use", "Clean up and report the error"]],
      ["What is undefined behaviour in C? Give two examples and explain why it is dangerous.", ["The standard places no requirements, so anything can happen", "Examples: out-of-bounds access, signed overflow, use after free, null dereference", "It can work in testing and fail later or under another compiler"]],
      ["What is the difference between a memory leak, a dangling pointer and a buffer overflow?", ["Leak: allocated and never freed", "Dangling: points to freed or ended storage", "Overflow: writes past a buffer's end"]],
      ["How do you compile a C program with warnings enabled, and how do you debug a segmentation fault?", ["gcc or clang with -Wall -Wextra and -g", "Run under gdb and read the backtrace", "Check pointers, bounds and lifetimes; sanitizers help"]],
      ["What is the difference between passing by value and passing a pointer in C?", ["C copies arguments", "A pointer lets the callee modify the caller's data", "Use const for read-only access"]],
    ],
  },
  {
    id: "cpp", name: "C++", aliases: ["c++", "cpp"],
    fundamentals: [
      ["What is the difference between a reference and a pointer in C++?", ["A reference is an alias that must be bound and cannot be reseated", "A pointer can be null and reassigned", "Choose references for required parameters"]],
      ["What does RAII mean, and why does C++ rely on it?", ["Resources are tied to object lifetime", "Constructors acquire, destructors release", "Exception-safe cleanup without manual calls"]],
      ["What is the difference between stack and heap allocation, and what does new do?", ["Automatic storage versus dynamic storage", "new allocates and constructs, delete destroys and frees", "Prefer smart pointers over raw new/delete"]],
    ],
    applied: [
      ["When would you use unique_ptr, shared_ptr or a plain reference?", ["unique_ptr for sole ownership", "shared_ptr for shared ownership with a reference count", "Plain reference or raw pointer for non-owning access"]],
      ["Explain the rule of three, five and zero and give an example where it matters.", ["Copy constructor, assignment, destructor (plus move)", "Needed when a class owns a resource", "Rule of zero: let members manage themselves"]],
    ],
    followUps: [
      ["Your CV lists C++. What is the difference between copy and move, and when is a move used?", ["Copy duplicates, move transfers ownership", "Moves apply to temporaries or std::move", "The moved-from object is valid but unspecified"]],
      ["What is virtual dispatch, and why should a base class destructor be virtual?", ["Calls resolve at run time through the vtable", "Deleting a derived object through a base pointer needs a virtual destructor", "Otherwise the derived destructor is skipped"]],
      ["How do the standard containers vector, map and unordered_map differ in cost?", ["Contiguous storage and amortised push_back", "Ordered tree versus hash table", "Iterator invalidation on growth"]],
    ],
  },
  {
    id: "java", name: "Java", aliases: ["java"],
    fundamentals: [
      ["What is the difference between == and equals() in Java?", ["== compares references for objects", "equals compares logical equality", "Override equals together with hashCode"]],
      ["What are the main differences between an interface and an abstract class?", ["Interfaces define a contract and allow multiple implementation", "Abstract classes can hold state and constructors", "Choose by relationship: capability versus shared base"]],
      ["How does Java manage memory, and what does the garbage collector do?", ["Objects live on the heap and are collected when unreachable", "No manual free", "Leaks still happen through lingering references"]],
    ],
    applied: [
      ["Explain how a HashMap works and what happens on a key collision.", ["Hash picks a bucket", "Collisions chain entries in a bucket", "Needs consistent equals and hashCode"]],
      ["What is the difference between checked and unchecked exceptions, and how do you decide which to throw?", ["Checked must be declared or handled", "Unchecked signal programming errors", "Do not swallow exceptions"]],
    ],
    followUps: [
      ["Your CV lists Java. How would you make a class safe to share between threads?", ["Prefer immutability", "synchronized, locks or concurrent collections", "Visibility and race conditions"]],
      ["What are generics for, and what is type erasure?", ["Compile-time type safety without casts", "Type information is erased at run time", "Consequences such as no generic arrays"]],
      ["What does the Stream API give you, and when would you avoid it?", ["Declarative pipelines over collections", "Lazy intermediate operations", "Avoid for side effects or when a loop is clearer"]],
    ],
  },
  {
    id: "python", name: "Python", aliases: ["python"],
    fundamentals: [
      ["What is the difference between a list, a tuple, a set and a dictionary in Python?", ["Mutable ordered list versus immutable tuple", "Set holds unique items", "Dictionary maps hashable keys to values"]],
      ["What happens when you read a missing dictionary key, and how do you supply a default?", ["KeyError for square brackets", "get() with a default", "Decide whether a missing key is an error"]],
      ["What is a virtual environment and why use one?", ["Isolated dependencies per project", "Avoids version conflicts", "Record requirements for repeatability"]],
    ],
    applied: [
      ["Explain list comprehensions and generators, and when a generator is better.", ["Concise construction of lists", "Generators produce items lazily", "Lower memory for large or streaming data"]],
      ["How do you handle errors in Python, and what is wrong with a bare except?", ["try, except and finally", "Catch specific exceptions", "Bare except hides bugs and interrupts"]],
    ],
    followUps: [
      ["Your CV lists Python. What is the difference between a shallow copy and a deep copy?", ["Shallow copies share nested objects", "Deep copy duplicates recursively", "Mutable default arguments are a related trap"]],
      ["What is a decorator and how does it work?", ["A function that wraps another function", "Applied with @ syntax", "Use functools.wraps to keep metadata"]],
      ["What does the GIL mean for threads in CPython, and what would you use for CPU-bound work?", ["Only one thread runs Python bytecode at a time", "Threads help with I/O waits", "Use multiprocessing or native extensions for CPU-bound work"]],
    ],
  },
  {
    id: "javascript", name: "JavaScript", aliases: ["javascript", "js", "ecmascript"],
    fundamentals: [
      ["What is the difference between var, let and const?", ["Function versus block scope", "const prevents reassignment, not mutation", "Hoisting and the temporal dead zone"]],
      ["What is a closure, and when have you relied on one?", ["A function remembers its surrounding scope", "Used for private state and callbacks", "Beware loops capturing a shared variable"]],
      ["How does == differ from === in JavaScript?", ["== coerces types", "=== compares without coercion", "Prefer ==="]],
    ],
    applied: [
      ["You need two independent API results. How do you start both together and handle one failing?", ["Promise.all starts both and rejects on first failure", "Promise.allSettled when you need every outcome", "Rejection does not cancel the other request"]],
      ["Explain the event loop: what runs first, a promise callback or a setTimeout callback?", ["Single thread with a call stack", "Microtasks (promises) run before timers", "Never block the loop with long work"]],
    ],
    followUps: [
      ["Your CV lists JavaScript. What does this refer to, and how do arrow functions change it?", ["Depends on how a function is called", "Arrow functions take this from the surrounding scope", "bind, call and apply"]],
      ["What is the difference between a promise and async/await?", ["async/await is syntax over promises", "await pauses the function, not the thread", "Use try/catch for errors"]],
      ["How does prototypal inheritance work in JavaScript?", ["Objects link to a prototype", "Property lookup walks the chain", "class syntax is built on prototypes"]],
    ],
  },
  {
    id: "typescript", name: "TypeScript", aliases: ["typescript", "ts"],
    fundamentals: [
      ["What does TypeScript add to JavaScript, and what happens to the types at run time?", ["Static types checked at compile time", "Types are erased in the output", "Catches mistakes early but not runtime data"]],
      ["What is the difference between type and interface, and between any and unknown?", ["Both describe shapes; interfaces merge and extend", "any switches checking off", "unknown forces narrowing before use"]],
    ],
    applied: [
      ["An API response has type unknown. How do you check it before reading an email field?", ["Treat it as untrusted", "Narrow with type guards or a runtime schema", "A cast does not validate"]],
      ["How would you model a value that is either a success with data or a failure with an error?", ["Discriminated union", "Narrowing on a tag field", "Exhaustive checks"]],
    ],
    followUps: [
      ["Your CV lists TypeScript. What are generics useful for? Give an example.", ["Reusable code that keeps type relationships", "Constraints with extends", "For example a typed fetch or list helper"]],
      ["Why does casting with 'as' not protect you from bad data?", ["It changes the compiler's view only", "Nothing is checked at run time", "Validate the real value"]],
    ],
  },
  {
    id: "react", name: "React", aliases: ["react", "react.js", "reactjs"],
    fundamentals: [
      ["What is the difference between props and state in React?", ["Props are inputs from the parent", "State is owned and changed by the component", "Changing state re-renders"]],
      ["Why does React need keys when rendering a list?", ["Identify items across renders", "Stable ids avoid wrong reuse", "Index keys cause problems when the list changes"]],
      ["What do useState and useEffect do, and what is the dependency array for?", ["State inside a function component", "Effects run after render for side effects", "Dependencies control when the effect re-runs"]],
    ],
    applied: [
      ["A component re-renders too often and feels slow. How do you find and fix the cause?", ["Measure with React DevTools Profiler", "Avoid unnecessary state and new object props", "memo, useMemo and useCallback only when measured"]],
      ["Where would you keep state shared by several components, and what are the trade-offs?", ["Lift state up to the nearest common parent", "Context or a store for wider sharing", "Avoid prop drilling without over-globalising"]],
    ],
    followUps: [
      ["Your CV lists React. What goes wrong if an effect has a missing dependency?", ["Stale values captured in the closure", "Effects not re-running when they should", "The lint rule and the fix"]],
      ["Controlled versus uncontrolled inputs: what is the difference?", ["Controlled: React state drives the value", "Uncontrolled: the DOM holds it, read via a ref", "Trade-offs for forms"]],
      ["How do you fetch data in a React component and handle loading and error states?", ["Fetch in an effect or a data library", "Model loading, success and error states", "Cancel or ignore stale responses"]],
    ],
  },
  {
    id: "node", name: "Node.js", aliases: ["node.js", "node", "nodejs"],
    fundamentals: [
      ["How does Node.js handle many connections with a single thread?", ["Event loop and non-blocking I/O", "Callbacks and promises resume work", "CPU-heavy work blocks everyone"]],
      ["What is the difference between require and import in Node.js?", ["CommonJS versus ES modules", "Static versus dynamic loading", "Configuration through package.json"]],
    ],
    applied: [
      ["A Node.js API gets slow under load. How do you find out why?", ["Measure first: logs, profiler, metrics", "Look for blocking calls and slow queries", "Scale out or add caching only with evidence"]],
      ["How do you handle errors in an Express route, including from async code?", ["Central error-handling middleware", "Pass errors to next or use async wrappers", "Return correct status codes without leaking internals"]],
    ],
    followUps: [
      ["Your CV lists Node.js. What are streams and when would you use them?", ["Process data in chunks", "Constant memory for large files", "Backpressure"]],
      ["How would you keep secrets and configuration out of your code?", ["Environment variables", "Never commit secrets", "Separate config per environment"]],
    ],
  },
  {
    id: "sql", name: "SQL", aliases: ["sql", "postgresql", "postgres", "mysql", "sqlite", "t-sql"],
    fundamentals: [
      ["What is the difference between INNER JOIN and LEFT JOIN? Give an example.", ["INNER keeps only matches", "LEFT keeps all left rows, NULL where no match", "Choose by whether missing matches matter"]],
      ["What do WHERE and HAVING do, and when is each used?", ["WHERE filters rows before grouping", "HAVING filters groups after aggregation", "An example with GROUP BY"]],
      ["What is a primary key and a foreign key?", ["Primary key identifies a row uniquely", "Foreign key references another table", "Integrity and relationships"]],
    ],
    applied: [
      ["A query filters a large table by one column and is slow. How could an index help, and what do you check first?", ["Index avoids a full scan", "Check the query plan with EXPLAIN", "Indexes cost writes and storage"]],
      ["What is a transaction, and what does ACID mean?", ["Group statements that succeed or fail together", "Atomicity, consistency, isolation, durability", "Example such as transferring money"]],
    ],
    followUps: [
      ["Your CV lists SQL. How do you find duplicate rows in a table?", ["GROUP BY with HAVING COUNT(*) > 1", "Or window functions such as ROW_NUMBER", "Decide which row to keep"]],
      ["What is SQL injection and how do you prevent it?", ["Untrusted input changes the query", "Use parameterised queries", "Do not build SQL by string concatenation"]],
      ["When would you normalise a schema, and when might you denormalise?", ["Normalise to avoid duplication and anomalies", "Denormalise for read performance with a measured need", "Trade-offs"]],
    ],
  },
  {
    id: "git", name: "Git", aliases: ["git", "github", "gitlab"],
    fundamentals: [
      ["What is the difference between git merge and git rebase?", ["Merge joins histories with a merge commit", "Rebase replays commits onto another base", "Do not rebase shared history"]],
      ["What do add, commit and push each do?", ["Stage changes", "Record a snapshot locally", "Send commits to a remote"]],
    ],
    applied: [
      ["You committed a bug and pushed it. How do you undo it safely on a shared branch?", ["git revert creates an undoing commit", "Avoid rewriting shared history", "Explain reset versus revert"]],
      ["How do you resolve a merge conflict?", ["Read the conflict markers", "Decide the right combined result and test it", "Mark resolved and commit"]],
    ],
    followUps: [
      ["Your CV lists Git. How would you find which commit introduced a bug?", ["git bisect", "git log and blame for context", "Narrow by good and bad commits"]],
      ["What is a good branching and pull request workflow for a small team?", ["Short-lived feature branches", "Review before merge", "Small focused commits with clear messages"]],
    ],
  },
  {
    id: "docker", name: "Docker", aliases: ["docker", "containers"],
    fundamentals: [
      ["What is the difference between a Docker image and a container?", ["Image is a read-only template", "Container is a running instance", "Many containers per image"]],
      ["Why use containers instead of installing everything on the server?", ["Same environment everywhere", "Isolation of dependencies", "Faster, repeatable deployment"]],
    ],
    applied: [
      ["Walk through a Dockerfile for a Node.js or Python app. How do you keep the image small and builds fast?", ["Small base image", "Order layers so dependencies cache", "Multi-stage builds and a .dockerignore"]],
      ["How does data persist when a container is removed?", ["Container filesystem is ephemeral", "Volumes or bind mounts", "Keep state outside the container"]],
    ],
    followUps: [
      ["Your CV lists Docker. A container exits right after starting. How do you debug it?", ["docker logs and the exit code", "Run interactively with a shell", "Check the command, environment and ports"]],
      ["What is the difference between CMD and ENTRYPOINT, and what does docker compose add?", ["Default command versus fixed executable", "Compose defines multi-container setups", "Networking and volumes in one file"]],
    ],
  },
];

const norm = (s: string) => s.trim().toLowerCase();

/** The bank entry for a skill or technology name, or undefined. Exact names only: "Java" is not "JavaScript" and "C" is not "C++". */
export function techFor(skill: string): TechEntry | undefined {
  const name = norm(skill.replace(/\s*\((?:coursework|learning)\)\s*$/i, ""));
  return TECH_BANK.find((t) => t.aliases.includes(name));
}
