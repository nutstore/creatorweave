/**
 * Learning Mode Tool
 *
 * Provides educational support for student users:
 * - Step-by-step explanations
 * - Concept breakdown and visualization
 * - Interactive Q&A with progress tracking
 * - Difficulty adaptation based on performance
 * - Learning path recommendations
 *
 * @module learning-mode.tool
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'

// ============================================================================
// Types
// ============================================================================

interface LearningStep {
  stepNumber: number
  title: string
  content: string
  keyPoints: string[]
  examples?: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: number // in minutes
}

interface ConceptNode {
  id: string
  name: string
  description: string
  dependencies: string[] // prerequisite concepts
  relatedConcepts: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  category: string
}

interface LearningPlan {
  topic: string
  currentLevel: string
  targetLevel: string
  estimatedDuration: number // in hours
  modules: LearningModule[]
  prerequisites: string[]
  learningObjectives: string[]
}

interface LearningModule {
  id: string
  title: string
  description: string
  concepts: string[]
  activities: LearningActivity[]
  estimatedTime: number
  completed?: boolean
}

interface LearningActivity {
  type: 'explanation' | 'example' | 'exercise' | 'quiz' | 'project'
  title: string
  content: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: number
}

interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
}

interface LearningProgress {
  userId: string
  topic: string
  completedSteps: string[]
  quizScores: Record<string, number>
  currentDifficulty: 'beginner' | 'intermediate' | 'advanced'
  totalTimeSpent: number
  strengths: string[]
  weaknesses: string[]
  lastActivity: number
}

interface ExplanationResult {
  topic: string
  explanation: string
  steps: LearningStep[]
  keyConcepts: string[]
  relatedTopics: string[]
  difficulty: string
  analogies: string[]
  commonMistakes: string[]
  practiceQuestions: QuizQuestion[]
}

// ============================================================================
// Knowledge Base
// ============================================================================

/**
 * Concept knowledge base with dependencies
 * Maps concepts to their explanations and relationships
 */
const CONCEPT_KNOWLEDGE_BASE: Record<string, ConceptNode> = {
  // Programming fundamentals
  variable: {
    id: 'variable',
    name: 'Variable',
    description: 'A named storage location in memory that holds a value',
    dependencies: [],
    relatedConcepts: ['data-type', 'assignment', 'scope'],
    difficulty: 'beginner',
    category: 'programming',
  },
  'data-type': {
    id: 'data-type',
    name: 'Data Type',
    description: 'A classification that specifies what type of value a variable can hold',
    dependencies: ['variable'],
    relatedConcepts: ['type-system', 'casting', 'type-inference'],
    difficulty: 'beginner',
    category: 'programming',
  },
  function: {
    id: 'function',
    name: 'Function',
    description: 'A reusable block of code that performs a specific task',
    dependencies: ['variable'],
    relatedConcepts: ['parameter', 'return-value', 'recursion', 'closure'],
    difficulty: 'beginner',
    category: 'programming',
  },
  loop: {
    id: 'loop',
    name: 'Loop',
    description: 'A control structure that repeats a block of code',
    dependencies: ['variable'],
    relatedConcepts: ['iteration', 'condition', 'for-loop', 'while-loop'],
    difficulty: 'beginner',
    category: 'programming',
  },
  condition: {
    id: 'condition',
    name: 'Conditional Statement',
    description: 'A decision-making construct that executes different code based on conditions',
    dependencies: ['variable'],
    relatedConcepts: ['boolean', 'if-statement', 'switch'],
    difficulty: 'beginner',
    category: 'programming',
  },
  array: {
    id: 'array',
    name: 'Array',
    description: 'A collection of elements stored at contiguous memory locations',
    dependencies: ['variable'],
    relatedConcepts: ['list', 'index', 'iteration'],
    difficulty: 'beginner',
    category: 'programming',
  },
  object: {
    id: 'object',
    name: 'Object',
    description: 'A compound data structure that holds properties and methods',
    dependencies: ['variable', 'function'],
    relatedConcepts: ['class', 'prototype', 'inheritance', 'encapsulation'],
    difficulty: 'intermediate',
    category: 'programming',
  },
  class: {
    id: 'class',
    name: 'Class',
    description: 'A blueprint for creating objects with shared properties and methods',
    dependencies: ['object', 'function'],
    relatedConcepts: ['inheritance', 'polymorphism', 'encapsulation', 'constructor'],
    difficulty: 'intermediate',
    category: 'programming',
  },
  async: {
    id: 'async',
    name: 'Asynchronous Programming',
    description: 'A programming pattern that allows code to run without blocking',
    dependencies: ['function', 'promise'],
    relatedConcepts: ['callback', 'promise', 'async-await', 'event-loop'],
    difficulty: 'intermediate',
    category: 'programming',
  },
  promise: {
    id: 'promise',
    name: 'Promise',
    description:
      'An object representing the eventual completion or failure of an asynchronous operation',
    dependencies: ['function', 'async'],
    relatedConcepts: ['async-await', 'callback', 'then', 'catch'],
    difficulty: 'intermediate',
    category: 'programming',
  },

  // Data structures
  'linked-list': {
    id: 'linked-list',
    name: 'Linked List',
    description: 'A linear data structure where elements are stored in nodes with pointers',
    dependencies: ['object'],
    relatedConcepts: ['pointer', 'node', 'singly-linked', 'doubly-linked'],
    difficulty: 'intermediate',
    category: 'data-structures',
  },
  stack: {
    id: 'stack',
    name: 'Stack',
    description: 'A LIFO (Last In First Out) data structure',
    dependencies: ['array'],
    relatedConcepts: ['queue', 'push', 'pop', 'recursion'],
    difficulty: 'intermediate',
    category: 'data-structures',
  },
  queue: {
    id: 'queue',
    name: 'Queue',
    description: 'A FIFO (First In First Out) data structure',
    dependencies: ['array'],
    relatedConcepts: ['stack', 'enqueue', 'dequeue', 'priority-queue'],
    difficulty: 'intermediate',
    category: 'data-structures',
  },
  tree: {
    id: 'tree',
    name: 'Tree',
    description: 'A hierarchical data structure with nodes connected by edges',
    dependencies: ['object'],
    relatedConcepts: ['binary-tree', 'bst', 'traversal', 'root', 'leaf'],
    difficulty: 'intermediate',
    category: 'data-structures',
  },
  graph: {
    id: 'graph',
    name: 'Graph',
    description: 'A data structure with vertices connected by edges',
    dependencies: ['tree'],
    relatedConcepts: ['directed-graph', 'weighted-graph', 'adjacency', 'traversal'],
    difficulty: 'advanced',
    category: 'data-structures',
  },
  'hash-table': {
    id: 'hash-table',
    name: 'Hash Table',
    description: 'A data structure that maps keys to values using a hash function',
    dependencies: ['array', 'function'],
    relatedConcepts: ['hash-function', 'collision', 'bucket', 'map'],
    difficulty: 'advanced',
    category: 'data-structures',
  },

  // Algorithms
  sorting: {
    id: 'sorting',
    name: 'Sorting Algorithm',
    description: 'Algorithms that arrange elements in a specific order',
    dependencies: ['array', 'loop'],
    relatedConcepts: ['bubble-sort', 'merge-sort', 'quick-sort', 'time-complexity'],
    difficulty: 'intermediate',
    category: 'algorithms',
  },
  searching: {
    id: 'searching',
    name: 'Search Algorithm',
    description: 'Algorithms that find specific elements in data structures',
    dependencies: ['array', 'loop'],
    relatedConcepts: ['linear-search', 'binary-search', 'search-tree'],
    difficulty: 'intermediate',
    category: 'algorithms',
  },
  recursion: {
    id: 'recursion',
    name: 'Recursion',
    description: 'A technique where a function calls itself to solve a problem',
    dependencies: ['function', 'condition'],
    relatedConcepts: ['base-case', 'recursive-case', 'stack-overflow', 'backtracking'],
    difficulty: 'intermediate',
    category: 'algorithms',
  },
  'dynamic-programming': {
    id: 'dynamic-programming',
    name: 'Dynamic Programming',
    description: 'An optimization technique that breaks problems into overlapping subproblems',
    dependencies: ['recursion'],
    relatedConcepts: ['memoization', 'tabulation', 'optimal-substructure'],
    difficulty: 'advanced',
    category: 'algorithms',
  },
  greedy: {
    id: 'greedy',
    name: 'Greedy Algorithm',
    description: 'An algorithm that makes locally optimal choices at each step',
    dependencies: ['loop', 'condition'],
    relatedConcepts: ['optimization', 'local-optimum', 'global-optimum'],
    difficulty: 'advanced',
    category: 'algorithms',
  },

  // Web development
  html: {
    id: 'html',
    name: 'HTML',
    description: 'The standard markup language for creating web pages',
    dependencies: [],
    relatedConcepts: ['element', 'attribute', 'dom', 'semantic-html'],
    difficulty: 'beginner',
    category: 'web',
  },
  css: {
    id: 'css',
    name: 'CSS',
    description: 'A style sheet language used for describing the presentation of HTML',
    dependencies: ['html'],
    relatedConcepts: ['selector', 'property', 'box-model', 'flexbox', 'grid'],
    difficulty: 'beginner',
    category: 'web',
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    description: 'A programming language that enables interactive web pages',
    dependencies: ['html', 'function'],
    relatedConcepts: ['dom', 'event', 'closure', 'prototype'],
    difficulty: 'beginner',
    category: 'web',
  },
  dom: {
    id: 'dom',
    name: 'DOM',
    description: 'The Document Object Model representing HTML documents as tree structures',
    dependencies: ['html', 'javascript', 'tree'],
    relatedConcepts: ['element', 'node', 'event', 'manipulation'],
    difficulty: 'intermediate',
    category: 'web',
  },
  http: {
    id: 'http',
    name: 'HTTP',
    description: 'The foundation of data communication on the Web',
    dependencies: [],
    relatedConcepts: ['request', 'response', 'method', 'status-code', 'header'],
    difficulty: 'intermediate',
    category: 'web',
  },
  api: {
    id: 'api',
    name: 'API',
    description: 'A set of protocols for building and integrating application software',
    dependencies: ['http'],
    relatedConcepts: ['rest', 'graphql', 'endpoint', 'json'],
    difficulty: 'intermediate',
    category: 'web',
  },

  // Database
  database: {
    id: 'database',
    name: 'Database',
    description: 'An organized collection of structured information or data',
    dependencies: [],
    relatedConcepts: ['sql', 'table', 'query', 'index', 'transaction'],
    difficulty: 'intermediate',
    category: 'database',
  },
  sql: {
    id: 'sql',
    name: 'SQL',
    description: 'A language for managing data in relational databases',
    dependencies: ['database'],
    relatedConcepts: ['select', 'join', 'where', 'group-by', 'aggregation'],
    difficulty: 'intermediate',
    category: 'database',
  },
}

/**
 * Learning templates for different types of explanations
 */
const LEARNING_TEMPLATES = {
  concept: {
    beginner: {
      structure: [
        { step: 'introduction', title: 'What is it?' },
        { step: 'analogy', title: 'Simple Analogy' },
        { step: 'example', title: 'See it in Action' },
        { step: 'practice', title: 'Try it Yourself' },
      ],
      estimatedTime: 15,
    },
    intermediate: {
      structure: [
        { step: 'definition', title: 'Formal Definition' },
        { step: 'breakdown', title: 'How it Works' },
        { step: 'examples', title: 'Real-world Examples' },
        { step: 'exercises', title: 'Practice Exercises' },
        { step: 'common-pitfalls', title: 'Common Mistakes to Avoid' },
      ],
      estimatedTime: 30,
    },
    advanced: {
      structure: [
        { step: 'theory', title: 'Theoretical Foundation' },
        { step: 'implementation', title: 'Implementation Details' },
        { step: 'optimization', title: 'Optimization Strategies' },
        { step: 'applications', title: 'Advanced Applications' },
        { step: 'research', title: 'Current Research & Trends' },
      ],
      estimatedTime: 45,
    },
  },
  problem_solving: {
    structure: [
      { step: 'understand', title: 'Understand the Problem' },
      { step: 'plan', title: 'Plan Your Approach' },
      { step: 'implement', title: 'Implement the Solution' },
      { step: 'test', title: 'Test and Verify' },
      { step: 'optimize', title: 'Optimize if Needed' },
    ],
    estimatedTime: 20,
  },
  code_review: {
    structure: [
      { step: 'overview', title: 'Code Overview' },
      { step: 'analysis', title: 'Line-by-Line Analysis' },
      { step: 'issues', title: 'Identified Issues' },
      { step: 'improvements', title: 'Suggested Improvements' },
      { step: 'summary', title: 'Summary & Action Items' },
    ],
    estimatedTime: 15,
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get difficulty level based on user progress
 */
function getAdaptiveDifficulty(
  _topic: string,
  userProgress?: Partial<LearningProgress>
): 'beginner' | 'intermediate' | 'advanced' {
  if (!userProgress) {
    return 'beginner'
  }

  const { currentDifficulty, completedSteps, quizScores } = userProgress

  // If user has completed many steps successfully, increase difficulty
  if (completedSteps && completedSteps.length > 5) {
    const avgScore = quizScores
      ? Object.values(quizScores).reduce((a, b) => a + b, 0) / Object.values(quizScores).length
      : 0
    if (avgScore > 0.8 && completedSteps.length > 10) {
      return 'advanced'
    }
    if (avgScore > 0.6) {
      return 'intermediate'
    }
  }

  return currentDifficulty || 'beginner'
}

/**
 * Find concept in knowledge base
 */
function findConcept(query: string): ConceptNode | null {
  const normalizedQuery = query.toLowerCase().trim()

  // Direct match
  if (CONCEPT_KNOWLEDGE_BASE[normalizedQuery]) {
    return CONCEPT_KNOWLEDGE_BASE[normalizedQuery]
  }

  // Fuzzy match
  for (const concept of Object.values(CONCEPT_KNOWLEDGE_BASE)) {
    const name = concept.name.toLowerCase()
    const desc = concept.description.toLowerCase()

    if (
      name.includes(normalizedQuery) ||
      normalizedQuery.includes(name) ||
      desc.includes(normalizedQuery)
    ) {
      return concept
    }

    // Check related concepts
    for (const related of concept.relatedConcepts) {
      if (
        related.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(related.toLowerCase())
      ) {
        return concept
      }
    }
  }

  return null
}

/**
 * Build learning path for a concept including prerequisites
 */
function buildLearningPath(conceptId: string): string[] {
  const path: string[] = []
  const visited = new Set<string>()

  function addPath(id: string) {
    if (visited.has(id) || !CONCEPT_KNOWLEDGE_BASE[id]) {
      return
    }
    visited.add(id)

    const concept = CONCEPT_KNOWLEDGE_BASE[id]

    // Add prerequisites first
    for (const prereq of concept.dependencies) {
      addPath(prereq)
    }

    path.push(id)
  }

  addPath(conceptId)
  return path
}

/**
 * Generate analogies for a concept
 */
function generateAnalogies(concept: ConceptNode): string[] {
  const analogiesMap: Record<string, string[]> = {
    variable: [
      'Think of a variable like a labeled box where you can store different items',
      'Like a locker in school - you put something in and can take it out later using the locker number',
    ],
    function: [
      'A function is like a recipe - you give it ingredients (parameters), it follows steps (code), and produces a dish (return value)',
      'Like a vending machine - you press a button (call the function) and get a specific item (result)',
    ],
    loop: [
      'A loop is like doing laps around a track - you keep running until you complete the required number',
      'Like reading a page book - you read word by word until you reach the end',
    ],
    array: [
      'An array is like a row of numbered mailboxes - each has an address (index) and contains mail (value)',
      'Like a bookshelf with books in sequence - you can find any book by its position number',
    ],
    recursion: [
      'Recursion is like Russian nesting dolls - each doll contains a smaller version of itself',
      'Like asking your friend to help with a task, and they ask another friend, and so on until someone can do it directly',
    ],
    promise: [
      'A Promise is like a pizza order - you place the order now and get a receipt that promises your pizza will arrive later',
      "Like a rain check for an event - it guarantees you'll get in, but you might have to wait",
    ],
    stack: [
      'A stack is like a stack of plates - you can only add or remove from the top',
      "Like the browser's back button - each page you visit is added, and going back removes the most recent",
    ],
    queue: [
      'A queue is like a line at a store - first person in line is first to be served (FIFO)',
      'Like a print queue - documents are printed in the order they were sent',
    ],
    'hash-table': [
      'A hash table is like a library with a catalog system - the catalog tells you exactly which shelf to find a book',
      'Like a hotel with room numbers - you can find any guest if you know their room number',
    ],
    tree: [
      'A tree is like a family tree - starting from one ancestor (root) and branching into descendants',
      'Like an organizational chart - CEO at the top, managers below, employees at the bottom',
    ],
  }

  return (
    analogiesMap[concept.id] || [
      `Think of ${concept.name} as a building block that helps organize your code`,
      `Like a tool in a toolbox - ${concept.name} has a specific purpose that makes certain tasks easier`,
    ]
  )
}

/**
 * Generate common mistakes for a concept
 */
function generateCommonMistakes(concept: ConceptNode): string[] {
  const mistakesMap: Record<string, string[]> = {
    variable: [
      'Forgetting to initialize a variable before using it',
      'Using wrong variable names (typos) that create new variables instead of using existing ones',
      'Not understanding scope - where variables can be accessed',
    ],
    function: [
      'Forgetting to return a value when needed',
      'Not passing all required parameters',
      'Confusing parameter names with variable names in the calling code',
    ],
    loop: [
      'Creating infinite loops by forgetting to update the loop variable',
      'Off-by-one errors - looping one time too many or too few',
      'Modifying the collection while iterating over it',
    ],
    array: [
      'Off-by-one errors - forgetting arrays are 0-indexed',
      'Accessing array elements beyond the array length',
      'Confusing array length with the last index',
    ],
    async: [
      'Forgetting to use await with async functions',
      'Not handling errors (try/catch) in async code',
      'Mixing callbacks and promises in confusing ways',
    ],
    recursion: [
      'Forgetting the base case, causing infinite recursion',
      'Not understanding that each recursive call uses stack space',
      'Trying to track too much state in recursive functions',
    ],
  }

  return (
    mistakesMap[concept.id] || [
      'Not practicing enough with examples',
      'Moving to advanced topics before mastering basics',
      'Not asking questions when confused',
    ]
  )
}

/**
 * Generate practice questions for a concept
 */
function generatePracticeQuestions(concept: ConceptNode, count = 3): QuizQuestion[] {
  const questionsMap: Record<string, QuizQuestion[]> = {
    variable: [
      {
        id: 'var-1',
        question: 'What is the purpose of declaring a variable?',
        options: [
          'To store and retrieve data',
          'To create a new function',
          'To delete memory',
          'To stop the program',
        ],
        correctAnswer: 0,
        explanation:
          'Variables are named storage locations in memory that hold values, allowing you to store and retrieve data throughout your program.',
        difficulty: 'beginner',
      },
      {
        id: 'var-2',
        question: 'Which is a valid variable name?',
        options: ['2cool4school', 'user_name', 'class', 'my-variable'],
        correctAnswer: 1,
        explanation:
          'Variable names can contain letters, numbers, underscores, but cannot start with a number or be a reserved keyword.',
        difficulty: 'beginner',
      },
      {
        id: 'var-3',
        question: 'What happens if you use a variable before declaring it?',
        options: [
          'It automatically gets declared',
          'You get an error (in most languages)',
          'It becomes null',
          'It creates a global variable',
        ],
        correctAnswer: 1,
        explanation:
          "Using a variable before declaring it typically causes a reference error because the variable doesn't exist yet.",
        difficulty: 'beginner',
      },
    ],
    function: [
      {
        id: 'func-1',
        question: 'What is a parameter in a function?',
        options: [
          "The function's name",
          'Input value that the function receives',
          'The return value',
          'A variable inside the function',
        ],
        correctAnswer: 1,
        explanation:
          'Parameters are variables listed in the function definition that receive the input values (arguments) when the function is called.',
        difficulty: 'beginner',
      },
      {
        id: 'func-2',
        question: 'What does the return statement do?',
        options: [
          'Stops the function and sends a value back',
          'Prints the result',
          'Creates a loop',
          'Nothing special',
        ],
        correctAnswer: 0,
        explanation:
          'The return statement ends function execution and specifies a value to be returned to the function caller.',
        difficulty: 'beginner',
      },
      {
        id: 'func-3',
        question: 'Can a function call itself?',
        options: [
          'No, never',
          'Yes, this is called recursion',
          'Only in certain languages',
          'Yes, but it creates an error',
        ],
        correctAnswer: 1,
        explanation:
          "When a function calls itself, it's called recursion. It must have a base case to prevent infinite calls.",
        difficulty: 'intermediate',
      },
    ],
    loop: [
      {
        id: 'loop-1',
        question: 'What is an infinite loop?',
        options: [
          'A loop that runs forever',
          'A loop that never starts',
          'A very long loop',
          'A loop in space',
        ],
        correctAnswer: 0,
        explanation:
          'An infinite loop is a loop that continues executing indefinitely because its termination condition is never met.',
        difficulty: 'beginner',
      },
      {
        id: 'loop-2',
        question: 'In a for loop, what does the initialization do?',
        options: [
          'Checks if the loop should continue',
          'Sets up the loop variable before first iteration',
          'Updates the loop variable',
          'Exits the loop',
        ],
        correctAnswer: 1,
        explanation:
          'The initialization runs once before the loop starts, typically to set up or declare the loop counter variable.',
        difficulty: 'beginner',
      },
      {
        id: 'loop-3',
        question: 'What happens if you modify an array while looping over it?',
        options: [
          "Nothing, it's fine",
          'You might skip elements or get errors',
          'The loop stops',
          'It creates a copy',
        ],
        correctAnswer: 1,
        explanation:
          'Modifying a collection during iteration can cause unexpected behavior like skipping elements or index errors.',
        difficulty: 'intermediate',
      },
    ],
    array: [
      {
        id: 'arr-1',
        question: 'What is the index of the first element in an array?',
        options: ['0', '1', '-1', 'It depends'],
        correctAnswer: 0,
        explanation:
          'Most programming languages use 0-based indexing, meaning the first element is at index 0.',
        difficulty: 'beginner',
      },
      {
        id: 'arr-2',
        question: 'How do you get the number of elements in an array?',
        options: ['array.count()', 'array.length', 'array.size()', 'len(array)'],
        correctAnswer: 1,
        explanation:
          'In JavaScript, arrays have a .length property that returns the number of elements.',
        difficulty: 'beginner',
      },
      {
        id: 'arr-3',
        question: "What happens when you access an index that doesn't exist?",
        options: ['You get null', 'You get undefined', 'The array grows', 'You get an error'],
        correctAnswer: 1,
        explanation:
          'Accessing a non-existent array index returns undefined (not an error) in JavaScript.',
        difficulty: 'beginner',
      },
    ],
  }

  const defaultQuestions: QuizQuestion[] = [
    {
      id: `${concept.id}-1`,
      question: `What is the main purpose of ${concept.name}?`,
      options: [
        concept.description,
        `To confuse programmers`,
        `To make code slower`,
        `To use more memory`,
      ],
      correctAnswer: 0,
      explanation: concept.description,
      difficulty: concept.difficulty,
    },
    {
      id: `${concept.id}-2`,
      question: `Which of the following is related to ${concept.name}?`,
      options: [concept.relatedConcepts[0] || 'Programming', 'Cooking', 'Sports', 'Music'],
      correctAnswer: 0,
      explanation: `${concept.name} is related to ${concept.relatedConcepts[0] || 'programming concepts'}.`,
      difficulty: concept.difficulty,
    },
    {
      id: `${concept.id}-3`,
      question: `Is ${concept.name} a ${concept.difficulty} topic?`,
      options: ['Yes, it is', "No, it's beginner", "No, it's advanced", "It doesn't have a level"],
      correctAnswer: 0,
      explanation: `${concept.name} is classified as a ${concept.difficulty} concept.`,
      difficulty: concept.difficulty,
    },
  ]

  return questionsMap[concept.id]?.slice(0, count) || defaultQuestions.slice(0, count)
}

/**
 * Generate explanation steps for a concept
 */
function generateExplanationSteps(
  concept: ConceptNode,
  difficulty: 'beginner' | 'intermediate' | 'advanced'
): LearningStep[] {
  const template = LEARNING_TEMPLATES.concept[difficulty]
  const steps: LearningStep[] = []
  const analogies = generateAnalogies(concept)
  const mistakes = generateCommonMistakes(concept)

  template.structure.forEach((item, index) => {
    const step: LearningStep = {
      stepNumber: index + 1,
      title: item.title,
      content: '',
      keyPoints: [],
      examples: [],
      difficulty,
      estimatedTime: template.estimatedTime / template.structure.length,
    }

    switch (item.step) {
      case 'introduction':
      case 'definition':
        step.content = `${concept.name}: ${concept.description}`
        step.keyPoints = [
          `Category: ${concept.category}`,
          `Difficulty: ${concept.difficulty}`,
          concept.description,
        ]
        break

      case 'analogy':
        step.content = `Here's a simple way to think about ${concept.name}:`
        step.keyPoints = analogies.map((a) => `📝 ${a}`)
        step.examples = analogies
        break

      case 'example':
      case 'examples':
        step.content = `Let's see ${concept.name} in action:`
        step.examples = [
          `// Example of ${concept.name}`,
          `// This demonstrates how ${concept.name} works in practice`,
        ]
        step.keyPoints = [
          'Notice the pattern',
          'See how it connects to related concepts',
          'Try modifying the example',
        ]
        break

      case 'practice':
      case 'exercises':
        step.content = 'Practice Activities:'
        step.keyPoints = [
          '✍️ Write your own example',
          '🔄 Modify existing examples',
          '💡 Think of real-world applications',
        ]
        break

      case 'breakdown':
        step.content = `How ${concept.name} works:`
        step.keyPoints = ['Input/Requirements', 'Process/Algorithm', 'Output/Result']
        if (concept.relatedConcepts.length > 0) {
          step.keyPoints.push(`Related: ${concept.relatedConcepts.join(', ')}`)
        }
        break

      case 'common-pitfalls':
        step.content = 'Common mistakes to avoid:'
        step.keyPoints = mistakes.map((m) => `⚠️ ${m}`)
        break

      case 'implementation':
        step.content = `Implementation details for ${concept.name}:`
        step.keyPoints = ['Performance considerations', 'Memory usage', 'Time complexity']
        break

      case 'optimization':
        step.content = 'Optimization strategies:'
        step.keyPoints = ['When to optimize', 'Common optimizations', 'Trade-offs']
        break

      case 'applications':
        step.content = 'Real-world applications:'
        step.keyPoints = concept.relatedConcepts.map((c) => `🔗 ${c}`)
        break

      case 'theory':
        step.content = `Theoretical foundation of ${concept.name}:`
        step.keyPoints = ['Mathematical basis', 'Historical context', 'Academic perspective']
        break

      default:
        step.content = `Learning about ${concept.name}`
        step.keyPoints = [concept.description]
    }

    steps.push(step)
  })

  return steps
}

// ============================================================================
// Tool Executors
// ============================================================================

async function explainConcept(
  query: string,
  difficulty?: 'beginner' | 'intermediate' | 'advanced',
  userProgress?: Partial<LearningProgress>
): Promise<ExplanationResult> {
  const concept = findConcept(query)

  if (!concept) {
    return {
      topic: query,
      explanation: `I couldn't find a specific concept matching "${query}". However, I can help you learn about it!`,
      steps: [],
      keyConcepts: [],
      relatedTopics: [],
      difficulty: difficulty || 'beginner',
      analogies: [`Let's approach "${query}" step by step`],
      commonMistakes: ['Make sure to understand the basics first'],
      practiceQuestions: [],
    }
  }

  const adaptiveDifficulty = difficulty || getAdaptiveDifficulty(concept.id, userProgress)
  const steps = generateExplanationSteps(concept, adaptiveDifficulty)
  const learningPath = buildLearningPath(concept.id)
  const analogies = generateAnalogies(concept)
  const mistakes = generateCommonMistakes(concept)
  const questions = generatePracticeQuestions(concept, 3)

  return {
    topic: concept.name,
    explanation: concept.description,
    steps,
    keyConcepts: learningPath,
    relatedTopics: concept.relatedConcepts,
    difficulty: adaptiveDifficulty,
    analogies,
    commonMistakes: mistakes,
    practiceQuestions: questions,
  }
}

async function createLearningPlan(
  topic: string,
  currentLevel: 'beginner' | 'intermediate' | 'advanced',
  targetLevel: 'beginner' | 'intermediate' | 'advanced'
): Promise<LearningPlan> {
  const concept = findConcept(topic)

  if (!concept) {
    return {
      topic,
      currentLevel,
      targetLevel,
      estimatedDuration: 10,
      modules: [],
      prerequisites: [],
      learningObjectives: [`Learn about ${topic}`],
    }
  }

  const learningPath = buildLearningPath(concept.id)
  const modules: LearningModule[] = []

  // Create modules based on learning path
  learningPath.forEach((conceptId) => {
    const c = CONCEPT_KNOWLEDGE_BASE[conceptId]
    if (c) {
      modules.push({
        id: c.id,
        title: c.name,
        description: c.description,
        concepts: c.relatedConcepts,
        activities: [
          {
            type: 'explanation',
            title: `Learn about ${c.name}`,
            content: c.description,
            difficulty: c.difficulty,
            estimatedTime: 15,
          },
          {
            type: 'example',
            title: 'Examples',
            content: `See ${c.name} in action`,
            difficulty: c.difficulty,
            estimatedTime: 10,
          },
          {
            type: 'exercise',
            title: 'Practice',
            content: 'Practice exercises',
            difficulty: c.difficulty,
            estimatedTime: 20,
          },
          {
            type: 'quiz',
            title: 'Quiz',
            content: 'Test your knowledge',
            difficulty: c.difficulty,
            estimatedTime: 5,
          },
        ],
        estimatedTime: 50,
      })
    }
  })

  return {
    topic: concept.name,
    currentLevel,
    targetLevel,
    estimatedDuration: modules.reduce((sum, m) => sum + m.estimatedTime, 0) / 60,
    modules,
    prerequisites: concept.dependencies,
    learningObjectives: [
      `Understand what ${concept.name} is`,
      `Learn how ${concept.name} works`,
      `Apply ${concept.name} in practice`,
      ...concept.relatedConcepts.map((r) => `Understand ${r}`),
    ],
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const explain: ToolDefinition = {
  type: 'function',
  function: {
    name: 'explain',
    description:
      'Get a step-by-step explanation of a programming concept or topic. Adapts to your skill level with analogies, examples, and practice questions.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'The concept or topic to explain (e.g., "variable", "function", "recursion", "async/await")',
        },
        difficulty: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'Desired explanation depth (default: auto-adapts based on progress)',
        },
        include_examples: {
          type: 'boolean',
          description: 'Include code examples in the explanation',
        },
        include_quiz: {
          type: 'boolean',
          description: 'Include practice quiz questions',
        },
      },
      required: ['topic'],
    },
  },
}

export const explain_executor: ToolExecutor = async (
  args: unknown,
  _context: ToolContext
): Promise<string> => {
  const params = args as {
    topic: string
    difficulty?: 'beginner' | 'intermediate' | 'advanced'
    include_examples?: boolean
    include_quiz?: boolean
  }

  try {
    const result = await explainConcept(params.topic, params.difficulty)

    // Filter based on preferences
    if (!params.include_examples) {
      result.steps.forEach((step) => {
        step.examples = []
      })
    }

    if (!params.include_quiz) {
      result.practiceQuestions = []
    }

    return JSON.stringify(
      {
        success: true,
        tool: 'explain',
        ...result,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        tool: 'explain',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

export const create_learning_plan: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_learning_plan',
    description:
      'Create a structured learning plan for a topic with modules, activities, and time estimates. Includes prerequisites and learning objectives.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The topic to create a learning plan for',
        },
        current_level: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'Your current skill level (default: beginner)',
        },
        target_level: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'Your target skill level (default: intermediate)',
        },
        max_duration: {
          type: 'number',
          description: 'Maximum desired learning time in hours',
        },
      },
      required: ['topic'],
    },
  },
}

export const create_learning_plan_executor: ToolExecutor = async (
  args: unknown,
  _context: ToolContext
): Promise<string> => {
  const params = args as {
    topic: string
    current_level?: 'beginner' | 'intermediate' | 'advanced'
    target_level?: 'beginner' | 'intermediate' | 'advanced'
    max_duration?: number
  }

  try {
    const plan = await createLearningPlan(
      params.topic,
      params.current_level || 'beginner',
      params.target_level || 'intermediate'
    )

    // Filter modules if max_duration is specified
    if (params.max_duration && plan.estimatedDuration > params.max_duration) {
      const targetHours = params.max_duration
      let currentHours = 0
      plan.modules = plan.modules.filter((m) => {
        if (currentHours + m.estimatedTime / 60 <= targetHours) {
          currentHours += m.estimatedTime / 60
          return true
        }
        return false
      })
      plan.estimatedDuration = currentHours
    }

    return JSON.stringify(
      {
        success: true,
        tool: 'create_learning_plan',
        ...plan,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        tool: 'create_learning_plan',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

export const solve_step_by_step: ToolDefinition = {
  type: 'function',
  function: {
    name: 'solve_step_by_step',
    description:
      'Get step-by-step guidance to solve a coding problem or understand a piece of code. Breaks down the problem into manageable steps.',
    parameters: {
      type: 'object',
      properties: {
        problem: {
          type: 'string',
          description: 'The problem statement or code to analyze',
        },
        language: {
          type: 'string',
          description: 'Programming language (if applicable)',
        },
      },
      required: ['problem'],
    },
  },
}

export const solve_step_by_step_executor: ToolExecutor = async (
  args: unknown,
  _context: ToolContext
): Promise<string> => {
  const params = args as {
    problem: string
    language?: string
  }

  const steps: LearningStep[] = [
    {
      stepNumber: 1,
      title: 'Understand the Problem',
      content: "First, let's break down what we're trying to accomplish",
      keyPoints: [
        'What are the inputs?',
        'What is the expected output?',
        'What are the constraints?',
      ],
      difficulty: 'beginner',
      estimatedTime: 5,
    },
    {
      stepNumber: 2,
      title: 'Plan Your Approach',
      content: "Let's think about the strategy to solve this",
      keyPoints: [
        'What algorithms or data structures might help?',
        "Are there similar problems you've solved?",
        "What's the simplest solution that could work?",
      ],
      difficulty: 'beginner',
      estimatedTime: 5,
    },
    {
      stepNumber: 3,
      title: 'Implement the Solution',
      content: "Now let's write the code step by step",
      keyPoints: [
        'Start with a skeleton/outline',
        'Fill in the core logic',
        'Add edge case handling',
      ],
      examples: params.language ? [`// Solution in ${params.language}`] : [],
      difficulty: 'intermediate',
      estimatedTime: 10,
    },
    {
      stepNumber: 4,
      title: 'Test and Verify',
      content: "Let's make sure our solution works correctly",
      keyPoints: ['Test with example inputs', 'Check edge cases', 'Verify the output'],
      difficulty: 'intermediate',
      estimatedTime: 5,
    },
    {
      stepNumber: 5,
      title: 'Optimize (if needed)',
      content: 'Review the solution for potential improvements',
      keyPoints: [
        'Can we improve time complexity?',
        'Can we improve space complexity?',
        'Is the code readable and maintainable?',
      ],
      difficulty: 'advanced',
      estimatedTime: 5,
    },
  ]

  return JSON.stringify(
    {
      success: true,
      tool: 'solve_step_by_step',
      problem: params.problem,
      language: params.language,
      steps,
      totalEstimatedTime: steps.reduce((sum, s) => sum + s.estimatedTime, 0),
    },
    null,
    2
  )
}

// Export for tool registry
export const learningModeTools: Record<
  string,
  { definition: ToolDefinition; executor: ToolExecutor }
> = {
  explain: { definition: explain, executor: explain_executor },
  create_learning_plan: {
    definition: create_learning_plan,
    executor: create_learning_plan_executor,
  },
  solve_step_by_step: { definition: solve_step_by_step, executor: solve_step_by_step_executor },
}

export const learningModeToolDefinitions: ToolDefinition[] = [
  explain,
  create_learning_plan,
  solve_step_by_step,
]

export const learningModeToolExecutors: Record<string, ToolExecutor> = {
  explain: explain_executor,
  create_learning_plan: create_learning_plan_executor,
  solve_step_by_step: solve_step_by_step_executor,
}
