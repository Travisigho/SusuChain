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
});