import MapView from "./components/MapView"

function App() {

  return (
    <div className="h-screen w-screen grid grid-cols-1 md:grid-cols-[320px_1fr]">
      <main className="h-screen w-screen relative">
        <MapView />
      </main>
    </div>
  )
}

export default App
