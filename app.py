from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def accueil():
    membres = [
        {"nom": "Ali", "cotisation": 5000},
        {"nom": "Awa", "cotisation": 3000},
        {"nom": "Moussa", "cotisation": 7000}
    ]
    return render_template("accueil.html", membres=membres)

if __name__ == "__main__":
    app.run(debug=True)
from flask import request, redirect, url_for

@app.route("/ajouter", methods=["POST"])
def ajouter():
    nom = request.form["nom"]
    montant = request.form["montant"]

    conn = sqlite3.connect("cotisation.db")
    cursor = conn.cursor()

    cursor.execute(
        "INSERT INTO cotisations (nom, montant) VALUES (?, ?)",
        (nom, montant)
    )

    conn.commit()
    conn.close()

    return redirect(url_for("accueil"))
