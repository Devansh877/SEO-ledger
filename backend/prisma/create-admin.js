// Creates or resets the platform admin login.
//
// This is the bootstrap and the recovery path in one. There is deliberately
// no "admin resets another admin" flow in the app — that would be a way to
// take over the platform from inside it — so if every admin password is
// lost, this script run against the database is how you get back in.
//
//   ADMIN_EMAIL=admin@nexit.au ADMIN_PASSWORD='...' npm run create-admin
//
// ADMIN_EMAIL defaults to admin@nexit.au.
//
// With ADMIN_PASSWORD set, that password is used as-is and the account is
// NOT forced to change it at next sign-in — you picked it deliberately.
// Without it, a strong password is generated, printed once, and must be
// replaced at first sign-in.
//
// If the account already exists, its password is reset and any lockout
// cleared. Nothing else about it changes.
const { PrismaClient } = require("@prisma/client");
const password = require("../src/lib/password");
const prisma = new PrismaClient();

const email = (process.env.ADMIN_EMAIL || "admin@nexit.au").trim().toLowerCase();
const supplied = process.env.ADMIN_PASSWORD;

async function main() {
  const chosen = supplied || password.generate();

  if (supplied) {
    // Reported, not enforced. A short bootstrap password is a deliberate,
    // temporary choice; refusing it here would just push you to set it
    // some other way with no warning at all.
    const problem = password.validate(supplied, { email });
    if (problem) {
      console.log("");
      console.log(`  WARNING: ${problem}`);
      console.log("  Using it anyway because you set ADMIN_PASSWORD explicitly.");
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  const data = {
    passwordHash: await password.hash(chosen),
    role: "ADMIN",
    // A password you typed yourself doesn't need replacing at sign-in; a
    // generated one printed to a terminal does.
    mustChangePassword: !supplied,
    passwordChangedAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  if (existing) {
    await prisma.user.update({ where: { email }, data });
  } else {
    await prisma.user.create({ data: { email, ...data, clientId: null } });
  }

  const admins = await prisma.user.count({ where: { role: "ADMIN" } });

  console.log("");
  console.log(existing ? "  Admin password reset." : "  Admin account created.");
  console.log("");
  console.log(`    Email     ${email}`);
  console.log(`    Password  ${chosen}`);
  console.log("");
  if (supplied) {
    console.log("  This password was supplied via ADMIN_PASSWORD and is active immediately.");
    console.log("  Change it from Settings -> Your password before real client logins exist.");
  } else {
    console.log("  Generated — save it now, it is not recoverable.");
    console.log("  You'll be asked to choose your own at first sign-in.");
  }
  console.log("");
  console.log(`  Total admin accounts: ${admins}`);
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
