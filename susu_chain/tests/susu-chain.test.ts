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
});