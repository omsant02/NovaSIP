import "dotenv/config";
import { withUser, getBook, saveBook } from "../agent/state.js";

const user = process.env.WALLET_A;
if (!user) throw new Error("WALLET_A missing in backend/.env");

await withUser(user, async () => {
  const book = await getBook();
  await saveBook({
    ...book,
    allocation: { carry: 0, lending: 0, hlp: 0, directional: 0, robinhood: 0 },
  });
  console.log("Book reset to all zeros for", user);
});
