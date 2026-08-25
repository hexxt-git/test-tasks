import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "./trpc-client";
import { useSubscription } from "@trpc/tanstack-react-query";

export default function App() {
  const [name, setName] = useState("world");
  const { data } = useQuery(trpc.hello.queryOptions(name));
  const subscription = useSubscription(
    trpc.subscribe.subscriptionOptions(name, {
      onData(data) {
        console.log("Received data:", data);
      },
    }),
  );

  console.log("Subscription data:", subscription.data);

  return (
    <section id="center">
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <h1>{data}</h1>
    </section>
  );
}
