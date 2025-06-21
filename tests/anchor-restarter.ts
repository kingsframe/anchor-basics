import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { AnchorRestarter } from "../target/types/anchor_restarter";
import { assert } from "chai";

describe("anchor-restarter", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anchorRestarter as Program<AnchorRestarter>;
  const connection = provider.connection;
  
  // Generate a PDA for the vault
  const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), provider.wallet.publicKey.toBuffer()],
    program.programId
  );
  
  const amount = new BN(1000000000); // 1 SOL in lamports

  it("can deposit to the vault", async () => {
    const initialBalance = await connection.getBalance(provider.wallet.publicKey);
    console.log("Deposit Initial balance", initialBalance);

    // 1. RPC method
    // const depositTx = await program.methods
    //   .deposit(amount)
    //   .rpc();
    // console.log("Deposit transaction signature", depositTx);
      
    // 2. Transaction method
    // const depositTx = await program.methods
    //   .deposit(amount)
    //   .transaction();
    
    // const depositTxSignature = await provider.sendAndConfirm(depositTx);
    // console.log("Deposit transaction signature", depositTxSignature);
    
    // 3. Instruction method
    const ix = await program.methods
      .deposit(amount)
      .instruction();

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: provider.wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message(); 

    const vtx = new VersionedTransaction(messageV0);
    vtx.sign([provider.wallet.payer]);
    
    // const depositTxSignature = await provider.sendAndConfirm(vtx);
    // console.log("Deposit transaction signature", depositTxSignature);

    const sig = await connection.sendTransaction(vtx);
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
    console.log("Deposit transaction signature", sig);
    
    // Verify the vault account was created with the correct balance
    const vaultAccount = await connection.getAccountInfo(vaultPDA);
    assert.isNotNull(vaultAccount, "Vault account should be created");
    assert.equal(vaultAccount.lamports, amount.toNumber(), "Vault should have the deposited amount");

    console.log("Vault account balance", vaultAccount.lamports);
    const finalBalance = await connection.getBalance(provider.wallet.publicKey);
    console.log("Deposit Final balance", finalBalance);
  });

  it("can withdraw from the vault", async () => {
    const initialBalance = await connection.getBalance(provider.wallet.publicKey);
    console.log("Withdraw Initial balance", initialBalance);    
    const withdrawTx = await program.methods
      .withdraw()
      .rpc();
    
    console.log("Withdraw transaction signature", withdrawTx);
    
    // Verify the vault account is closed (balance is 0)
    const vaultAccountAfterWithdraw = await connection.getAccountInfo(vaultPDA);
    assert.isNull(vaultAccountAfterWithdraw, "Vault account should be closed after withdrawal");
    
    // Verify the wallet received the funds back (minus transaction fees)
    const finalBalance = await connection.getBalance(provider.wallet.publicKey);
    console.log("Withdraw Final balance", finalBalance);
    assert.isAbove(
      finalBalance,
      initialBalance - amount.toNumber(),
      "Wallet should receive the withdrawn amount (minus transaction fees)"
    );
  });
});
