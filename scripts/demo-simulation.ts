#!/usr/bin/env tsx

import { MemServLight } from '../src/memserv';

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// ASCII Art
const MEM_SERV_ART = `
${colors.cyan}███╗   ███╗███████╗███╗   ███╗███████╗██████╗ ██╗   ██╗██╗     ██╗ ██████╗ ██╗  ██╗████████╗
${colors.cyan}████╗ ████║██╔════╝████╗ ████║██╔════╝██╔══██╗██║   ██║██║     ██║██╔════╝ ██║  ██║╚══██╔══╝
${colors.cyan}██╔████╔██║█████╗  ██╔████╔██║█████╗  ██████╔╝██║   ██║██║     ██║██║  ███╗███████║   ██║
${colors.cyan}██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══╝  ██╔══██╗██║   ██║██║     ██║██║   ██║██╔══██║   ██║
${colors.cyan}██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗██║  ██║╚██████╔╝███████╗██║╚██████╔╝██║  ██║   ██║
${colors.cyan}╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝
${colors.reset}`;

interface DemoStep {
  step: number;
  title: string;
  command: string;
  explanation: string;
  expectedResult: string;
  storageState?: { key: string; value: string }[];
  technicalDetails?: {
    respEncoding?: string;
    databaseInternals?: string;
    persistence?: string;
    memoryLayout?: string;
  };
}

// Demo steps configuration
const demoSteps: DemoStep[] = [
  {
    step: 1,
    title: "Verifying Connection",
    command: "PING",
    explanation: "Tests if the MemServLight server is responding",
    expectedResult: "PONG",
         technicalDetails: {
       respEncoding: `*1\\r\\n$4\\r\\nPING\\r\\n`,
      databaseInternals: "No database operation - just connection verification",
      persistence: "No persistence operation",
      memoryLayout: "No memory changes"
    }
  },
  {
    step: 2,
    title: "SET Operation - Storing Data",
    command: 'SET user:1 "John Doe"',
    explanation: "Stores the value 'John Doe' with key 'user:1'",
    expectedResult: "OK",
    storageState: [{ key: "user:1", value: "John Doe" }],
    technicalDetails: {
             respEncoding: `*3\\r\\n$3\\r\\nSET\\r\\n$6\\r\\nuser:1\\r\\n$8\\r\\nJohn Doe\\r\\n`,
      databaseInternals: "Hash table insertion with key collision resolution",
      persistence: "Command logged to AOF (Append-Only File) if persistence enabled",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"]                        │
│  Bucket 1: []                                           │
│  Bucket 2: []                                           │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 3,
    title: "GET Operation - Retrieving Data",
    command: "GET user:1",
    explanation: "Retrieves the value stored under key 'user:1'",
    expectedResult: '"John Doe"',
    technicalDetails: {
             respEncoding: `*2\\r\\n$3\\r\\nGET\\r\\n$6\\r\\nuser:1\\r\\n`,
      databaseInternals: "Hash table lookup with O(1) average time complexity",
      persistence: "Read operation - no persistence needed",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"] ← Retrieved from here  │
│  Bucket 1: []                                           │
│  Bucket 2: []                                           │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 4,
    title: "SET with TTL - Temporary Data",
    command: 'SET session:abc "temp_data" EX 10',
    explanation: "Stores 'temp_data' with key 'session:abc' that expires in 10 seconds",
    expectedResult: "OK",
    storageState: [
      { key: "user:1", value: "John Doe" },
      { key: "session:abc", value: "temp_data (expires in 10s)" }
    ],
    technicalDetails: {
             respEncoding: `*5\\r\\n$3\\r\\nSET\\r\\n$10\\r\\nsession:abc\\r\\n$9\\r\\ntemp_data\\r\\n$2\\r\\nEX\\r\\n$2\\r\\n10\\r\\n`,
      databaseInternals: "Hash table insertion + expiration time tracking",
      persistence: "Command logged to AOF with expiration metadata",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"]                        │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)]       │
│  Bucket 2: []                                           │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                  Expiration Queue                       │
├─────────────────────────────────────────────────────────┤
│  [session:abc: expires at ${Date.now() + 10000}ms]     │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 5,
    title: "TTL Operation - Check Expiration",
    command: "TTL session:abc",
    explanation: "Shows how many seconds until the key expires",
    expectedResult: "10",
    technicalDetails: {
             respEncoding: `*2\\r\\n$3\\r\\nTTL\\r\\n$10\\r\\nsession:abc\\r\\n`,
      databaseInternals: "Expiration time calculation from current timestamp",
      persistence: "Read operation - no persistence needed",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"]                        │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)]       │
│  Bucket 2: []                                           │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                  Expiration Queue                       │
├─────────────────────────────────────────────────────────┤
│  [session:abc: expires at ${Date.now() + 10000}ms]      │
│  TTL calculation: (expiry_time - current_time) / 1000   │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 6,
    title: "SET Another Value",
    command: 'SET user:2 "Jane Smith"',
    explanation: "Stores another user record",
    expectedResult: "OK",
    storageState: [
      { key: "user:1", value: "John Doe" },
      { key: "user:2", value: "Jane Smith" },
      { key: "session:abc", value: "temp_data (expires in 10s)" }
    ],
    technicalDetails: {
             respEncoding: `*3\\r\\n$3\\r\\nSET\\r\\n$6\\r\\nuser:2\\r\\n$10\\r\\nJane Smith\\r\\n`,
      databaseInternals: "Hash table insertion with potential collision resolution",
      persistence: "Command logged to AOF",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"]                        │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)]       │
│  Bucket 2: [user:2 → "Jane Smith"]                      │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 7,
    title: "KEYS Operation - List All Keys",
    command: "KEYS *",
    explanation: "Lists all keys in the database",
    expectedResult: '["user:1", "user:2", "session:abc"]',
          technicalDetails: {
        respEncoding: `*2\\r\\n$4\\r\\nKEYS\\r\\n$1\\r\\n*\\r\\n`,
        databaseInternals: "Hash table traversal to collect all keys (O(n) operation)",
      persistence: "Read operation - no persistence needed",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"] ← Scanned              │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)] ← Scanned │
│  Bucket 2: [user:2 → "Jane Smith"] ← Scanned            │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                    Result Array                         │
├─────────────────────────────────────────────────────────┤
│  ["user:1", "user:2", "session:abc"]                    │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 8,
    title: "GET Non-existent Key",
    command: "GET user:999",
    explanation: "Attempts to retrieve a key that doesn't exist",
    expectedResult: "(nil)",
          technicalDetails: {
        respEncoding: `*2\\r\\n$3\\r\\nGET\\r\\n$7\\r\\nuser:999\\r\\n`,
        databaseInternals: "Hash table lookup returns null for missing key",
      persistence: "Read operation - no persistence needed",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"]                        │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)]       │
│  Bucket 2: [user:2 → "Jane Smith"]                      │
│  ...                                                    │
│  Bucket N: [] ← user:999 not found here                 │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 9,
    title: "EXISTS Operation - Check Key Existence",
    command: "EXISTS user:1",
    explanation: "Checks if key 'user:1' exists",
    expectedResult: "1",
          technicalDetails: {
        respEncoding: `*2\\r\\n$6\\r\\nEXISTS\\r\\n$6\\r\\nuser:1\\r\\n`,
        databaseInternals: "Hash table lookup with boolean result",
      persistence: "Read operation - no persistence needed",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"] ← Found!               │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)]       │
│  Bucket 2: [user:2 → "Jane Smith"]                      │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                    Result                               │
├─────────────────────────────────────────────────────────┤
│  1 (true - key exists)                                  │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 10,
    title: "DEL Operation - Delete Key",
    command: "DEL user:2",
    explanation: "Deletes the key 'user:2' and its value",
    expectedResult: "1",
    storageState: [
      { key: "user:1", value: "John Doe" },
      { key: "session:abc", value: "temp_data (expires in 10s)" }
    ],
          technicalDetails: {
        respEncoding: `*2\\r\\n$3\\r\\nDEL\\r\\n$6\\r\\nuser:2\\r\\n`,
        databaseInternals: "Hash table removal with memory deallocation",
      persistence: "Command logged to AOF",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"]                        │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)]       │
│  Bucket 2: [] ← user:2 removed from here                │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                  Memory Freed                           │
├─────────────────────────────────────────────────────────┤
│  user:2 key and value memory deallocated                │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 11,
    title: "Verify Deletion",
    command: "GET user:2",
    explanation: "Attempts to retrieve the deleted key",
    expectedResult: "(nil)",
    technicalDetails: {
      respEncoding: `*2\r\n$3\r\nGET\r\n$6\r\nuser:2\r\n`,
      databaseInternals: "Hash table lookup returns null for deleted key",
      persistence: "Read operation - no persistence needed",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"]                        │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)]       │
│  Bucket 2: [] ← user:2 no longer exists                 │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘`
    }
  },
  {
    step: 12,
    title: "Final Keys Check",
    command: "KEYS *",
    explanation: "Lists remaining keys after deletion",
    expectedResult: '["user:1", "session:abc"]',
    technicalDetails: {
      respEncoding: `*2\r\n$4\r\nKEYS\r\n$1\r\n*\r\n`,
      databaseInternals: "Hash table traversal shows only remaining keys",
      persistence: "Read operation - no persistence needed",
      memoryLayout: `
┌─────────────────────────────────────────────────────────┐
│                    Hash Table                           │
├─────────────────────────────────────────────────────────┤
│  Bucket 0: [user:1 → "John Doe"] ← Scanned              │
│  Bucket 1: [session:abc → "temp_data" (TTL: 10s)] ← Scanned │
│  Bucket 2: [] ← Empty after deletion                    │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                    Result Array                         │
├─────────────────────────────────────────────────────────┤
│  ["user:1", "session:abc"]                              │
└─────────────────────────────────────────────────────────┘`
    }
  }
];

// Global MemServLight instance
let memServLight: MemServLight;

// Utility functions
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const printStep = (step: number, title: string) => {
  console.log(`\n${colors.yellow}╔══════════════════════════════════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.yellow}║${colors.reset} ${colors.white}STEP ${step}: ${title}${colors.reset} ${colors.yellow}${colors.reset}`);
  console.log(`${colors.yellow}╚══════════════════════════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);
};

const printCommand = (command: string, explanation: string) => {
  console.log(`${colors.blue}🔧 Command:${colors.reset} ${colors.green}${command}${colors.reset}`);
  console.log(`${colors.purple}💡 What it does:${colors.reset} ${explanation}`);
  console.log("");
};

const printResult = (result: string) => {
  console.log(`${colors.cyan}📤 Result:${colors.reset} ${colors.white}${result}${colors.reset}\n`);
};

const printStorage = (storageState?: { key: string; value: string }[]) => {
  if (!storageState) return;

  console.log(`${colors.green}🗄️  Storage State:${colors.reset}`);
  console.log(`${colors.yellow}┌─────────────────────────────────────────────────────────────────────────────────────────────┐${colors.reset}`);
  storageState.forEach(item => {
    console.log(`${colors.yellow}│${colors.reset} ${colors.cyan}Key:${colors.reset} ${colors.white}${item.key}${colors.reset} ${colors.yellow}${colors.reset}`);
    console.log(`${colors.yellow}│${colors.reset} ${colors.cyan}Value:${colors.reset} ${colors.white}${item.value}${colors.reset} ${colors.yellow}${colors.reset}`);
  });
  console.log(`${colors.yellow}└─────────────────────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);
};

const printTechnicalDetails = (details?: DemoStep['technicalDetails']) => {
  if (!details) return;

  console.log(`${colors.purple}🔬 Technical Details:${colors.reset}`);
  console.log(`${colors.yellow}┌─────────────────────────────────────────────────────────────────────────────────────────────┐${colors.reset}`);

  if (details.respEncoding) {
    // Format RESP encoding to be more readable
    const formattedResp = details.respEncoding
      .replace(/\r\n/g, '\\r\\n ')
      .replace(/\*/g, '\\*')
      .replace(/\$/g, '\\$');
    console.log(`${colors.yellow}│${colors.reset} ${colors.cyan}RESP Encoding:${colors.reset} ${colors.white}${formattedResp}${colors.reset} ${colors.yellow}${colors.reset}`);
  }

  if (details.databaseInternals) {
    console.log(`${colors.yellow}│${colors.reset} ${colors.cyan}Database:${colors.reset} ${colors.white}${details.databaseInternals}${colors.reset} ${colors.yellow}${colors.reset}`);
  }

  if (details.persistence) {
    console.log(`${colors.yellow}│${colors.reset} ${colors.cyan}Persistence:${colors.reset} ${colors.white}${details.persistence}${colors.reset} ${colors.yellow}${colors.reset}`);
  }

  if (details.memoryLayout) {
    console.log(`${colors.yellow}│${colors.reset} ${colors.cyan}Memory Layout:${colors.reset} ${colors.yellow}${colors.reset}`);
    const lines = details.memoryLayout.trim().split('\n');
    lines.forEach(line => {
      // Ensure proper alignment within the box
      const paddedLine = line.padEnd(65); // Adjust based on box width
      console.log(`${colors.yellow}│${colors.reset} ${colors.white}${paddedLine}${colors.reset} ${colors.yellow}${colors.reset}`);
    });
  }

  console.log(`${colors.yellow}└─────────────────────────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);
};

const typeEffect = async (text: string, delay: number = 50) => {
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(text[i]);
    await sleep(delay);
  }
  console.log("");
};

const waitForEnter = async () => {
  console.log(`${colors.yellow}Press Enter to continue to the next step... (or 'q' to quit)${colors.reset}`);
  return new Promise<void>((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      if (data[0] === 13) { // Enter key
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      } else if (data[0] === 113 || data[0] === 81) { // 'q' or 'Q' key
        process.stdin.setRawMode(false);
        process.stdin.pause();
        console.log(`\n${colors.yellow}Demo interrupted by user. Goodbye!${colors.reset}`);
        process.exit(0);
      }
    });
  });
};

// Execute command using the global MemServLight instance
const executeCommand = async (command: string): Promise<string> => {
  // Convert command string to RESP format for parsing
  const parts = command.split(' ');
  const respCommand = parts.map(part => {
    // Remove quotes if present
    if ((part.startsWith('"') && part.endsWith('"')) ||
        (part.startsWith("'") && part.endsWith("'"))) {
      return part.slice(1, -1);
    }
    return part;
  });

  // Create RESP array format
  const respArray = `*${respCommand.length}\r\n${respCommand.map(part => `$${part.length}\r\n${part}\r\n`).join('')}`;

  const parsedCommand = memServLight.parse(respArray);

  if (!parsedCommand) {
    return "(error) Invalid command";
  }

  try {
    const response = await memServLight.execute(parsedCommand);
    return response.trim();
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};

// Main demo function
const runDemo = async () => {
  // Initialize the global MemServLight instance
  memServLight = new MemServLight();

  // Clear screen and show intro
  console.clear();
  console.log(MEM_SERV_ART);
    console.log(`${colors.white}Welcome to MemServLight Demo Simulation!${colors.reset}`);
  console.log(`${colors.cyan}This demo will walk you through GET and SET operations step by step.${colors.reset}`);
  console.log(`${colors.yellow}Press Enter to continue... (or 'q' to quit)${colors.reset}`);

  // Wait for user input
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.once('data', (data) => {
    if (data[0] === 13) { // Enter key
      process.stdin.setRawMode(false);
      process.stdin.pause();
      startDemo();
    } else if (data[0] === 113 || data[0] === 81) { // 'q' or 'Q' key
      process.stdin.setRawMode(false);
      process.stdin.pause();
      console.log(`\n${colors.yellow}Demo cancelled by user. Goodbye!${colors.reset}`);
      process.exit(0);
    }
  });
};

const startDemo = async () => {
  // Run through all demo steps
  for (const step of demoSteps) {
    printStep(step.step, step.title);
    printCommand(step.command, step.explanation);

    await typeEffect(`memserv> ${step.command}`, 100);

    const result = await executeCommand(step.command);
    printResult(result);

    if (step.storageState) {
      printStorage(step.storageState);
    }

    // Print technical details
    printTechnicalDetails(step.technicalDetails);

    // Add success message for certain steps
    if (step.step === 1) {
      console.log(`${colors.green}✅ Connection established!${colors.reset}`);
    } else if (step.step === 3) {
      console.log(`${colors.green}✅ Successfully retrieved the stored value!${colors.reset}`);
    } else if (step.step === 5) {
      console.log(`${colors.green}✅ Key will expire in 10 seconds!${colors.reset}`);
    } else if (step.step === 7) {
      console.log(`${colors.green}✅ All keys are visible!${colors.reset}`);
    } else if (step.step === 8) {
      console.log(`${colors.yellow}⚠️  Returns nil for non-existent keys${colors.reset}`);
    } else if (step.step === 9) {
      console.log(`${colors.green}✅ Key exists!${colors.reset}`);
    } else if (step.step === 10) {
      console.log(`${colors.green}✅ Key deleted successfully!${colors.reset}`);
    } else if (step.step === 11) {
      console.log(`${colors.yellow}⚠️  Key no longer exists after deletion${colors.reset}`);
    } else if (step.step === 12) {
      console.log(`${colors.green}✅ Only remaining keys are shown!${colors.reset}`);
    }

    // Wait for user to press Enter before next step
    await waitForEnter();
  }

  // Demo summary
  console.log(`\n${colors.yellow}╔══════════════════════════════════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.yellow}║${colors.reset} ${colors.white}🎉 DEMO COMPLETE!${colors.reset} ${colors.yellow}${colors.reset}`);
  console.log(`${colors.yellow}╚══════════════════════════════════════════════════════════════════════════════════════════════════╝${colors.reset}`);

  console.log(`\n${colors.cyan}📚 What we reviewed:${colors.reset}`);
  console.log(`  • ${colors.green}SET${colors.reset} stores key-value pairs in memory`);
  console.log(`  • ${colors.green}GET${colors.reset} retrieves values by key`);
  console.log(`  • ${colors.green}TTL${colors.reset} sets expiration time for keys`);
  console.log(`  • ${colors.green}DEL${colors.reset} removes keys from storage`);
  console.log(`  • ${colors.green}KEYS${colors.reset} lists all stored keys`);
  console.log(`  • ${colors.green}EXISTS${colors.reset} checks if a key exists`);
  console.log(`  • Non-existent keys return ${colors.yellow}(nil)${colors.reset}`);

  console.log(`\n${colors.purple}🔬 Technical Insights:${colors.reset}`);
  console.log(`  • ${colors.cyan}RESP Protocol${colors.reset}: Redis Serialization Protocol for client-server communication`);
  console.log(`  • ${colors.cyan}Hash Tables${colors.reset}: O(1) average time complexity for key-value operations`);
  console.log(`  • ${colors.cyan}Memory Management${colors.reset}: Automatic allocation and deallocation of key-value pairs`);
  console.log(`  • ${colors.cyan}Persistence${colors.reset}: AOF (Append-Only File) for data durability`);
  console.log(`  • ${colors.cyan}Expiration${colors.reset}: TTL tracking with automatic cleanup`);

    console.log(`\n${colors.purple}🚀 MemServLight is ready for your applications!${colors.reset}`);
  console.log(`${colors.yellow}Press Enter to exit... (or 'q' to quit)${colors.reset}`);

  // Wait for user input to exit
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.once('data', (data) => {
    if (data[0] === 13) { // Enter key
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.exit(0);
    } else if (data[0] === 113 || data[0] === 81) { // 'q' or 'Q' key
      process.stdin.setRawMode(false);
      process.stdin.pause();
      console.log(`\n${colors.yellow}Demo exited by user. Goodbye!${colors.reset}`);
      process.exit(0);
    }
  });
};

// Handle process termination
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Demo interrupted. Goodbye!${colors.reset}`);
  process.exit(0);
});

// Start the demo
runDemo().catch(error => {
  console.error(`${colors.red}Demo error:${colors.reset}`, error);
  process.exit(1);
});
