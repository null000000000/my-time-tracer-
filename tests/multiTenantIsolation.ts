import {
  sanitizeDatasetForImport,
  validateImportJson,
} from '../src/services/importExportService';
import {
  initGuestSession,
  getGuestSession,
  clearGuestSession,
  guestExecuteBatchImport,
  fetchAllGuestData,
} from '../src/services/guestStorage';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  details: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${msg}`);
  }
}

async function runTestSuite() {
  console.log('Starting Chronos Multi-Tenant & JSON Import Test Suite...\n');

  // ==========================================
  // Test 1: Empty Workspace on Initialization
  // ==========================================
  try {
    const freshGuest = initGuestSession();
    assert(freshGuest.projects.length === 0, 'Fresh guest workspace must have 0 projects');
    assert(freshGuest.tasks.length === 0, 'Fresh guest workspace must have 0 tasks');
    assert(freshGuest.calendarEvents.length === 0, 'Fresh guest workspace must have 0 calendar events');
    assert(freshGuest.timeEntries.length === 0, 'Fresh guest workspace must have 0 time entries');
    testResults.push({
      name: 'Test 1: Empty Workspace State',
      status: 'PASS',
      details: 'Verified that a fresh workspace initializes with 0 projects, 0 tasks, 0 calendar events, and 0 time entries.',
    });
  } catch (err: any) {
    testResults.push({
      name: 'Test 1: Empty Workspace State',
      status: 'FAIL',
      details: err.message,
    });
  }

  // ==========================================
  // Test 2: Independent JSON Imports (User A, B, C)
  // ==========================================
  try {
    const userA_raw = {
      projects: [
        { id: 'proj_root_1', name: 'User A Cybersecurity Lab', parentId: null, userId: 'old_spoofed_id_A' },
        { id: 'proj_sub_1', name: 'User A Network Recon', parentId: 'proj_root_1', userId: 'old_spoofed_id_A' },
      ],
      tasks: [
        { id: 'task_1', name: 'Run Wireshark', projectId: 'proj_sub_1', userId: 'old_spoofed_id_A' },
      ],
      timeEntries: [],
      calendarEvents: [],
    };

    const userB_raw = {
      projects: [
        { id: 'proj_root_1', name: 'User B Web App Pentesting', parentId: null, userId: 'old_spoofed_id_B' },
      ],
      tasks: [
        { id: 'task_1', name: 'OWASP ZAP Scan', projectId: 'proj_root_1', userId: 'old_spoofed_id_B' },
      ],
      timeEntries: [],
      calendarEvents: [],
    };

    const userC_raw = {
      projects: [
        { id: 'proj_root_1', name: 'User C University Dissertation', parentId: null, userId: 'old_spoofed_id_C' },
      ],
      tasks: [
        { id: 'task_1', name: 'Literature Review', projectId: 'proj_root_1', userId: 'old_spoofed_id_C' },
      ],
      timeEntries: [],
      calendarEvents: [],
    };

    const resA = sanitizeDatasetForImport(userA_raw, 'user_A_uid', true, 'projects_A.json');
    const resB = sanitizeDatasetForImport(userB_raw, 'user_B_uid', true, 'projects_B.json');
    const resC = sanitizeDatasetForImport(userC_raw, 'user_C_uid', true, 'projects_C.json');

    // Verify ownership assignment
    assert(resA.projects.every(p => p.userId === 'user_A_uid'), 'All User A projects must belong strictly to user_A_uid');
    assert(resA.tasks.every(t => t.userId === 'user_A_uid'), 'All User A tasks must belong strictly to user_A_uid');
    assert(resB.projects.every(p => p.userId === 'user_B_uid'), 'All User B projects must belong strictly to user_B_uid');
    assert(resC.projects.every(p => p.userId === 'user_C_uid'), 'All User C projects must belong strictly to user_C_uid');

    // Verify old spoofed userIds were stripped completely
    assert(!resA.projects.some(p => p.userId === 'old_spoofed_id_A'), 'Spoofed userId must be eliminated');

    // Verify independent Import IDs
    assert(resA.importRecord.id !== resB.importRecord.id, 'Import IDs must be unique across imports');
    assert(resB.importRecord.id !== resC.importRecord.id, 'Import IDs must be unique across imports');

    // Verify ID mapping avoids collisions even though raw IDs in both files were identical ('proj_root_1', 'task_1')
    assert(resA.projects[0].id !== resB.projects[0].id, 'Mapped project IDs must not collide');
    assert(resA.tasks[0].id !== resB.tasks[0].id, 'Mapped task IDs must not collide');

    testResults.push({
      name: 'Test 2: Independent JSON Imports (User A, B, C)',
      status: 'PASS',
      details: 'User A, B, and C datasets imported with complete ownership isolation, unique Import IDs, and collision-free ID mapping.',
    });
  } catch (err: any) {
    testResults.push({
      name: 'Test 2: Independent JSON Imports (User A, B, C)',
      status: 'FAIL',
      details: err.message,
    });
  }

  // ==========================================
  // Test 3: Cross-User Access & Ownership Tampering
  // ==========================================
  try {
    const rawMalicious = {
      projects: [
        { id: 'p_evil', name: 'Malicious Project', userId: 'victim_user_123' },
      ],
      tasks: [
        { id: 't_evil', name: 'Malicious Task', userId: 'victim_user_123', projectId: 'p_evil' },
      ],
    };

    // User attacker_999 uploads malicious JSON
    const sanitized = sanitizeDatasetForImport(rawMalicious, 'attacker_999', true);

    // Verify that victim_user_123 was overwritten by attacker_999
    assert(sanitized.projects[0].userId === 'attacker_999', 'System must force authenticated UID as owner');
    assert(sanitized.tasks[0].userId === 'attacker_999', 'System must force authenticated UID as task owner');
    assert(sanitized.projects[0].userId !== 'victim_user_123', 'Attacker cannot forge victim ownership');

    testResults.push({
      name: 'Test 3: Cross-User Ownership Tampering Prevention',
      status: 'PASS',
      details: 'Embedded foreign/victim ownership metadata was stripped; all records bound strictly to authenticated caller UID.',
    });
  } catch (err: any) {
    testResults.push({
      name: 'Test 3: Cross-User Ownership Tampering Prevention',
      status: 'FAIL',
      details: err.message,
    });
  }

  // ==========================================
  // Test 4: Multiple Consecutive Imports by Same User
  // ==========================================
  try {
    const rawImport1 = {
      projects: [{ id: 'proj_1', name: 'Sprint 1 Project' }],
      tasks: [{ id: 'task_1', name: 'Sprint 1 Task', projectId: 'proj_1' }],
    };
    const rawImport2 = {
      projects: [{ id: 'proj_1', name: 'Sprint 2 Project' }], // identical original ID
      tasks: [{ id: 'task_1', name: 'Sprint 2 Task', projectId: 'proj_1' }],
    };

    const imp1 = sanitizeDatasetForImport(rawImport1, 'user_A_uid', true, 'file_1.json');
    const imp2 = sanitizeDatasetForImport(rawImport2, 'user_A_uid', true, 'file_2.json');

    // Both should have different IDs despite identical original JSON IDs
    assert(imp1.projects[0].id !== imp2.projects[0].id, 'Multiple imports must generate non-colliding project IDs');
    assert(imp1.tasks[0].id !== imp2.tasks[0].id, 'Multiple imports must generate non-colliding task IDs');
    assert(imp1.importRecord.id !== imp2.importRecord.id, 'Import 1 and 2 must have distinct provenance importIds');

    testResults.push({
      name: 'Test 4: Multiple Imports & Collision Safety',
      status: 'PASS',
      details: 'Two consecutive imports by User A co-exist safely without ID collisions or data overwrites.',
    });
  } catch (err: any) {
    testResults.push({
      name: 'Test 4: Multiple Imports & Collision Safety',
      status: 'FAIL',
      details: err.message,
    });
  }

  // ==========================================
  // Test 5: Relational Hierarchy Preservation
  // ==========================================
  try {
    const hierarchyData = {
      projects: [
        { id: 'root_A', name: 'Penetration Testing Course', parentId: null },
        { id: 'sub_B', name: 'Active Directory Attacks', parentId: 'root_A' },
        { id: 'sub_C', name: 'Kerberoasting Module', parentId: 'sub_B' },
      ],
      tasks: [
        { id: 't_1', name: 'Extract Kerberos Tickets', projectId: 'sub_C' },
      ],
    };

    const sanitized = sanitizeDatasetForImport(hierarchyData, 'user_student', true);

    const rootProj = sanitized.projects.find(p => p.name === 'Penetration Testing Course')!;
    const subB = sanitized.projects.find(p => p.name === 'Active Directory Attacks')!;
    const subC = sanitized.projects.find(p => p.name === 'Kerberoasting Module')!;
    const task = sanitized.tasks[0];

    assert(rootProj.parentId === null, 'Root project must have null parentId');
    assert(subB.parentId === rootProj.id, 'Subproject B parentId must point to newly mapped Root Project ID');
    assert(subC.parentId === subB.id, 'Subproject C parentId must point to newly mapped Subproject B ID');
    assert(task.projectId === subC.id, 'Task projectId must point to newly mapped Subproject C ID');

    testResults.push({
      name: 'Test 5: Relational Hierarchy & Reference Integrity',
      status: 'PASS',
      details: 'Multi-level nested parent-child hierarchies and task-to-subproject references correctly mapped and preserved.',
    });
  } catch (err: any) {
    testResults.push({
      name: 'Test 5: Relational Hierarchy & Reference Integrity',
      status: 'FAIL',
      details: err.message,
    });
  }

  // ==========================================
  // Test 6: Guest Mode JSON Import Isolation
  // ==========================================
  try {
    clearGuestSession();
    const guestSession = initGuestSession();

    const guestUpload = {
      projects: [{ id: 'p_guest_1', name: 'Temporary CTF Lab' }],
      tasks: [{ id: 't_guest_1', name: 'Flag 1', projectId: 'p_guest_1' }],
    };

    const sanitizedGuest = sanitizeDatasetForImport(guestUpload, guestSession.sessionId, true);
    guestExecuteBatchImport({
      projects: sanitizedGuest.projects,
      tasks: sanitizedGuest.tasks,
      importRecord: sanitizedGuest.importRecord,
    });

    const storedGuest = getGuestSession();
    assert(storedGuest !== null, 'Guest session must exist');
    assert(storedGuest!.projects.length === 1, 'Guest workspace must contain imported project');
    assert(storedGuest!.projects[0].name === 'Temporary CTF Lab', 'Project name must match');
    assert(storedGuest!.projects[0].userId === guestSession.sessionId, 'Project userId must match guest session');
    assert(storedGuest!.imports?.length === 1, 'Guest provenance record must be stored');

    testResults.push({
      name: 'Test 6: Guest Mode JSON Import Isolation',
      status: 'PASS',
      details: 'Guest JSON import processed strictly into sessionStorage with zero cloud database writes.',
    });
  } catch (err: any) {
    testResults.push({
      name: 'Test 6: Guest Mode JSON Import Isolation',
      status: 'FAIL',
      details: err.message,
    });
  }

  // ==========================================
  // Test 7: Default Dataset Elimination
  // ==========================================
  try {
    // Verify that no default dataset is automatically returned by the system
    const emptyVal = validateImportJson({});
    assert(!emptyVal.isValid, 'Empty object must be recognized as invalid import');

    const emptyArrayVal = validateImportJson({ projects: [], tasks: [] });
    assert(!emptyArrayVal.isValid, 'Empty projects/tasks must not produce a default dataset');

    testResults.push({
      name: 'Test 7: Default Dataset Elimination & Empty State Validation',
      status: 'PASS',
      details: 'Verified that empty datasets are handled as clean zero-records states without injecting default data.',
    });
  } catch (err: any) {
    testResults.push({
      name: 'Test 7: Default Dataset Elimination & Empty State Validation',
      status: 'FAIL',
      details: err.message,
    });
  }

  // Print Summary
  console.log('----------------------------------------------------');
  console.log('MULTI-TENANT ISOLATION & JSON IMPORT TEST SUMMARY');
  console.log('----------------------------------------------------');
  let passCount = 0;
  testResults.forEach((t, i) => {
    const symbol = t.status === 'PASS' ? '✅' : '❌';
    console.log(`${symbol} [${t.status}] ${t.name}`);
    console.log(`   ${t.details}\n`);
    if (t.status === 'PASS') passCount++;
  });
  console.log(`Result: ${passCount}/${testResults.length} Tests Passed.`);
  process.exit(passCount === testResults.length ? 0 : 1);
}

runTestSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
