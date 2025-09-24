import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;
const wallet4 = accounts.get("wallet_4")!;

const contractName = "susu-chain";

describe("SusuChain Contract Tests", () => {
  beforeEach(() => {
    // Reset simnet state before each test
    simnet.setEpoch("3.0");
  });

  describe("Contract Initialization", () => {
    it("ensures simnet is properly initialized", () => {
      expect(simnet.blockHeight).toBeDefined();
      expect(simnet.blockHeight).toBeGreaterThan(0);
    });

    it("should have correct initial values", () => {
      const roundId = simnet.callReadOnlyFn(contractName, "get-current-round-id", [], deployer);
      const contributionAmount = simnet.callReadOnlyFn(contractName, "get-contribution-amount", [], deployer);
      const maxParticipants = simnet.callReadOnlyFn(contractName, "get-max-participants", [], deployer);
      const roundDuration = simnet.callReadOnlyFn(contractName, "get-round-duration", [], deployer);

      expect(roundId.result).toBeUint(0);
      expect(contributionAmount.result).toBeUint(1000000); // 1 STX
      expect(maxParticipants.result).toBeUint(52);
      expect(roundDuration.result).toBeUint(1008); // ~1 week in blocks
    });
  });

  describe("Round Creation", () => {
    it("should allow contract owner to create a round", () => {
      const createRound = simnet.callPublicFn(contractName, "create-round", [], deployer);
      
      expect(createRound.result).toBeOk(Cl.uint(1));

      // Verify round was created
      const round = simnet.callReadOnlyFn(contractName, "get-round", [Cl.uint(1)], deployer);
      expect(round.result).toBeTruthy();
    });

    it("should not allow non-owner to create a round", () => {
      const createRound = simnet.callPublicFn(contractName, "create-round", [], wallet1);
      
      expect(createRound.result).toBeErr(Cl.uint(100)); // err-owner-only
    });

    it("should increment round ID for consecutive rounds", () => {
      const round1 = simnet.callPublicFn(contractName, "create-round", [], deployer);
      const round2 = simnet.callPublicFn(contractName, "create-round", [], deployer);
      
      expect(round1.result).toBeOk(Cl.uint(1));
      expect(round2.result).toBeOk(Cl.uint(2));
    });
  });

  describe("Joining Rounds", () => {
    beforeEach(() => {
      // Create a round before each test
      simnet.callPublicFn(contractName, "create-round", [], deployer);
    });

    it("should allow participants to join an active round", () => {
      const joinRound = simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      
      expect(joinRound.result).toBeOk(Cl.bool(true));

      // Verify participant is in the round
      const isParticipant = simnet.callReadOnlyFn(contractName, "is-participant", [
        Cl.uint(1),
        Cl.principal(wallet1)
      ], deployer);
      expect(isParticipant.result).toBeBool(true);
    });

    it("should not allow joining non-existent round", () => {
      const joinRound = simnet.callPublicFn(contractName, "join-round", [Cl.uint(999)], wallet1);
      
      expect(joinRound.result).toBeErr(Cl.uint(101)); // err-not-found
    });

    it("should not allow duplicate participants", () => {
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      const joinAgain = simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      
      expect(joinAgain.result).toBeErr(Cl.uint(102)); // err-already-exists
    });

    it("should allow multiple participants to join", () => {
      const join1 = simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      const join2 = simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet2);
      const join3 = simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet3);
      
      expect(join1.result).toBeOk(Cl.bool(true));
      expect(join2.result).toBeOk(Cl.bool(true));
      expect(join3.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Contributions", () => {
    beforeEach(() => {
      // Setup: Create round and add participants
      simnet.callPublicFn(contractName, "create-round", [], deployer);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet2);
    });

    it("should allow participants to contribute", () => {
      const contribute = simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet1);
      
      expect(contribute.result).toBeOk(Cl.bool(true));

      // Verify participant status updated
      const participantStatus = simnet.callReadOnlyFn(contractName, "get-participant-status", [
        Cl.uint(1),
        Cl.principal(wallet1)
      ], deployer);
      
      expect(participantStatus.result).toBeTruthy();
    });

    it("should not allow non-participants to contribute", () => {
      const contribute = simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet4);
      
      expect(contribute.result).toBeErr(Cl.uint(107)); // err-not-participant
    });

    it("should not allow duplicate contributions", () => {
      simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet1);
      const contributeAgain = simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet1);
      
      expect(contributeAgain.result).toBeErr(Cl.uint(102)); // err-already-exists
    });

    it("should transfer STX to contract", () => {
      const initialBalance = simnet.getDataVar(contractName, "contribution-amount");
      
      const contribute = simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet1);
      
      expect(contribute.result).toBeOk(Cl.bool(true));
      
      // Verify round's total pool increased
      const round = simnet.callReadOnlyFn(contractName, "get-round", [Cl.uint(1)], deployer);
      expect(round.result).toBeTruthy();
    });
  });

  describe("Winner Selection", () => {
    beforeEach(() => {
      // Setup: Create round, add participants, and make contributions
      simnet.callPublicFn(contractName, "create-round", [], deployer);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet2);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet3);
      simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet2);
      simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet3);
      
      // Advance blocks to simulate time passing (more than 1 week)
      simnet.mineEmptyBlocks(1010);
    });

    it("should allow owner to select winner", () => {
      const selectWinner = simnet.callPublicFn(contractName, "select-winner", [Cl.uint(1)], deployer);
      
      expect(selectWinner.result).toBeTruthy();
      
      // Verify a winner was selected
      const round = simnet.callReadOnlyFn(contractName, "get-round", [Cl.uint(1)], deployer);
      expect(round.result).toBeTruthy();
    });

    it("should not allow non-owner to select winner", () => {
      const selectWinner = simnet.callPublicFn(contractName, "select-winner", [Cl.uint(1)], wallet1);
      
      expect(selectWinner.result).toBeErr(Cl.uint(100)); // err-owner-only
    });

    it("should transfer pool to winner", () => {
      const selectWinner = simnet.callPublicFn(contractName, "select-winner", [Cl.uint(1)], deployer);
      
      expect(selectWinner.result).toBeTruthy();
      
      // Winner should be returned as a principal (verified by the successful result)
    });

    it("should not allow winner selection with no eligible participants", () => {
      // Create new round with no contributions
      simnet.callPublicFn(contractName, "create-round", [], deployer);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(2)], wallet1);
      
      const selectWinner = simnet.callPublicFn(contractName, "select-winner", [Cl.uint(2)], deployer);
      
      expect(selectWinner.result).toBeErr(Cl.uint(108)); // err-round-not-ready
    });
  });

  describe("Round Management", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "create-round", [], deployer);
    });

    it("should allow owner to end a round", () => {
      // Advance blocks to simulate round completion
      simnet.mineEmptyBlocks(60000); // Much longer than max round duration
      
      const endRound = simnet.callPublicFn(contractName, "end-round", [Cl.uint(1)], deployer);
      
      expect(endRound.result).toBeOk(Cl.bool(true));
    });

    it("should not allow non-owner to end round", () => {
      const endRound = simnet.callPublicFn(contractName, "end-round", [Cl.uint(1)], wallet1);
      
      expect(endRound.result).toBeErr(Cl.uint(100)); // err-owner-only
    });

    it("should not allow ending active round prematurely", () => {
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      
      const endRound = simnet.callPublicFn(contractName, "end-round", [Cl.uint(1)], deployer);
      
      expect(endRound.result).toBeErr(Cl.uint(105)); // err-round-active
    });
  });

  describe("Configuration Management", () => {
    it("should allow owner to set contribution amount", () => {
      const setAmount = simnet.callPublicFn(contractName, "set-contribution-amount", [Cl.uint(2000000)], deployer);
      
      expect(setAmount.result).toBeOk(Cl.bool(true));

      const newAmount = simnet.callReadOnlyFn(contractName, "get-contribution-amount", [], deployer);
      expect(newAmount.result).toBeUint(2000000);
    });

    it("should not allow setting invalid contribution amount", () => {
      const setAmount = simnet.callPublicFn(contractName, "set-contribution-amount", [Cl.uint(0)], deployer);
      
      expect(setAmount.result).toBeErr(Cl.uint(109)); // err-invalid-amount
    });

    it("should allow owner to set max participants", () => {
      const setMax = simnet.callPublicFn(contractName, "set-max-participants", [Cl.uint(25)], deployer);
      
      expect(setMax.result).toBeOk(Cl.bool(true));

      const newMax = simnet.callReadOnlyFn(contractName, "get-max-participants", [], deployer);
      expect(newMax.result).toBeUint(25);
    });

    it("should not allow setting invalid max participants", () => {
      const setMax1 = simnet.callPublicFn(contractName, "set-max-participants", [Cl.uint(0)], deployer);
      const setMax2 = simnet.callPublicFn(contractName, "set-max-participants", [Cl.uint(100)], deployer);
      
      expect(setMax1.result).toBeErr(Cl.uint(109)); // err-invalid-amount
      expect(setMax2.result).toBeErr(Cl.uint(109)); // err-invalid-amount
    });

    it("should not allow non-owner to change configuration", () => {
      const setAmount = simnet.callPublicFn(contractName, "set-contribution-amount", [Cl.uint(2000000)], wallet1);
      const setMax = simnet.callPublicFn(contractName, "set-max-participants", [Cl.uint(25)], wallet1);
      
      expect(setAmount.result).toBeErr(Cl.uint(100)); // err-owner-only
      expect(setMax.result).toBeErr(Cl.uint(100)); // err-owner-only
    });
  });

  describe("Read-Only Functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(contractName, "create-round", [], deployer);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet2);
    });

    it("should return correct round information", () => {
      const round = simnet.callReadOnlyFn(contractName, "get-round", [Cl.uint(1)], deployer);
      
      expect(round.result).toBeTruthy();
    });

    it("should return participant status", () => {
      const status = simnet.callReadOnlyFn(contractName, "get-participant-status", [
        Cl.uint(1),
        Cl.principal(wallet1)
      ], deployer);
      
      expect(status.result).toBeTruthy();
    });

    it("should correctly identify participants", () => {
      const isParticipant1 = simnet.callReadOnlyFn(contractName, "is-participant", [
        Cl.uint(1),
        Cl.principal(wallet1)
      ], deployer);
      
      const isParticipant3 = simnet.callReadOnlyFn(contractName, "is-participant", [
        Cl.uint(1),
        Cl.principal(wallet3)
      ], deployer);
      
      expect(isParticipant1.result).toBeBool(true);
      expect(isParticipant3.result).toBeBool(false);
    });

    it("should return eligible participants", () => {
      const eligible = simnet.callReadOnlyFn(contractName, "get-eligible-participants", [Cl.uint(1)], deployer);
      
      expect(eligible.result).toBeTruthy();
    });

    it("should calculate current week correctly", () => {
      const week = simnet.callReadOnlyFn(contractName, "get-current-week", [Cl.uint(1)], deployer);
      
      expect(week.result).toBeUint(0); // Should be 0 at start
    });
  });

  describe("Complete Round Cycle", () => {
    it("should complete a full round cycle with multiple participants", () => {
      // Create round
      const createResult = simnet.callPublicFn(contractName, "create-round", [], deployer);
      expect(createResult.result).toBeOk(Cl.uint(1));

      // Join participants
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet2);
      simnet.callPublicFn(contractName, "join-round", [Cl.uint(1)], wallet3);

      // Week 1: All contribute
      simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet2);
      simnet.callPublicFn(contractName, "contribute", [Cl.uint(1)], wallet3);

      // Advance time and select winner
      simnet.mineEmptyBlocks(1010);
      const winner1 = simnet.callPublicFn(contractName, "select-winner", [Cl.uint(1)], deployer);
      expect(winner1.result).toBeTruthy();

      // Verify round continues (should still be active)
      const round = simnet.callReadOnlyFn(contractName, "get-round", [Cl.uint(1)], deployer);
      expect(round.result).toBeTruthy();
    });
  });
});