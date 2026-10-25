"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Loader2, LogIn, Puzzle, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

export function LocalAccess({ source }: { source: "login" | "register" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const registering = source === "register";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (registering) await api.register(username, password);
      else await api.login(username, password);
      router.replace("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <section className="w-full max-w-sm overflow-hidden rounded-lg border bg-background shadow-sm">
        <div className="border-b p-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground"><Puzzle className="h-4 w-4" /></span>游戏蓝图</Link>
          <h1 className="mt-6 text-xl font-semibold">{registering ? "创建账号" : "登录工作台"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{registering ? "首个注册账号会成为管理员并接管升级前的本地数据。" : "登录后访问你的项目、灵感、报告和对话。"}</p>
        </div>
        <form className="space-y-4 p-6" onSubmit={submit}>
          <label className="block text-sm font-medium">用户名<Input className="mt-1.5" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3-32 位字母、数字、_ 或 -" /></label>
          <label className="block text-sm font-medium">密码<Input className="mt-1.5" type="password" autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 10 位" /></label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={loading || username.length < 3 || password.length < 10}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : registering ? <UserPlus className="mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}
            {registering ? "注册并进入" : "登录"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{registering ? "已有账号？" : "还没有账号？"}<Link className="ml-1 text-foreground underline-offset-4 hover:underline" href={registering ? "/login" : "/register"}>{registering ? "去登录" : "开放注册"}</Link></p>
        </form>
      </section>
    </main>
  );
}
