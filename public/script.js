async function generate() {
  const number = document.getElementById("number").value;
  const result = document.getElementById("result");

  if (!number) {
    result.innerHTML = "❌ Number required";
    return;
  }

  result.innerHTML = "⏳ Generating...";

  try {
    const res = await fetch(`/api/pair?number=${number}`);
    const data = await res.json();

    if (!data.success) {
      result.innerHTML = "❌ " + data.error;
    } else {
      result.innerHTML = `
        ✅ Pairing Code:<br>
        <b style="font-size:22px">${data.code}</b>
      `;
    }
  } catch (e) {
    result.innerHTML = "❌ Server error";
  }
}
