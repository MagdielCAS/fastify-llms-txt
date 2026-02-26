const u = new URL("http://[::1]/foo");
console.log(`Hostname: '${u.hostname}'`);
console.log(`Is equal to '::1': ${u.hostname === "::1"}`);
console.log(`Is equal to '[::1]': ${u.hostname === "[::1]"}`);
