import os
import sys
import streamlit.web.cli as stcli


# Cria o objeto de fallback que a Vercel exige para não estourar o erro
def handler(request, response):
    return "Streamlit rodando via processo isolado."


app = handler

if __name__ == "__main__":
    # Aponta para o arquivo que era seu Geral.py (agora renomeado para app.py)
    script_path = os.path.join(os.path.dirname(__name__), "..", "app.py")
    sys.argv = [
        "streamlit",
        "run",
        script_path,
        "--server.port",
        "8080",
        "--server.address",
        "0.0.0.0",
    ]
    sys.exit(stcli.main())
